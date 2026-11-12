begin;
-- Match the browser's Unicode String.trim boundary rules, including NBSP/BOM.
create function public.trim_request_message(value text) returns text language sql immutable set search_path='' as $$
 select btrim(value,E' \t\n\r\f'||(select string_agg(chr(n),'') from unnest(array[11,160,5760,8192,8193,8194,8195,8196,8197,8198,8199,8200,8201,8202,8232,8233,8239,8287,12288,65279]) n))
$$;
create table public.request_messages(
 id uuid primary key,request_id uuid not null references public.tailoring_requests(id),
 sequence integer not null check(sequence>0),sender_id uuid not null references auth.users(id),
 body text not null check(char_length(body) between 1 and 2000 and body=public.trim_request_message(body)),
 created_at timestamptz not null default clock_timestamp(),unique(request_id,sequence)
);
alter table public.request_messages enable row level security;
revoke all on public.request_messages from public,anon,authenticated;
grant select on public.request_messages to authenticated;
create policy message_participants on public.request_messages for select to authenticated using(exists(select 1 from public.tailoring_requests r where r.id=request_id and auth.uid() in(r.customer_id,r.tailor_id)));
create table public.request_message_reads(
 request_id uuid not null references public.tailoring_requests(id),participant_id uuid not null references auth.users(id),
 last_read_sequence integer not null default 0 check(last_read_sequence>=0),read_at timestamptz not null default clock_timestamp(),primary key(request_id,participant_id)
);
alter table public.request_message_reads enable row level security;
revoke all on public.request_message_reads from public,anon,authenticated;
grant select on public.request_message_reads to authenticated;
create policy own_message_reads on public.request_message_reads for select to authenticated using(participant_id=auth.uid() and exists(select 1 from public.tailoring_requests r where r.id=request_id and auth.uid() in(r.customer_id,r.tailor_id)));

alter table public.request_notifications add column message_id uuid references public.request_messages(id);
alter table public.request_notifications drop constraint request_notifications_kind_check,drop constraint notification_event_shape;
alter table public.request_notifications add constraint request_notifications_kind_check check(kind in('two_days','due_today','quote_sent','quote_accepted','quote_declined','stage_changed','message_received')),
 add constraint notification_event_shape check(
 (kind in('two_days','due_today') and quote_id is null and revision is not null and confirmed_date is not null and progress_event_id is null and message_id is null)
 or (kind in('quote_sent','quote_accepted','quote_declined') and quote_id is not null and revision is null and confirmed_date is null and progress_event_id is null and message_id is null)
 or (kind='stage_changed' and quote_id is null and revision is null and confirmed_date is null and progress_event_id is not null and message_id is null)
 or (kind='message_received' and quote_id is null and revision is null and confirmed_date is null and progress_event_id is null and message_id is not null));
create unique index message_notification_once on public.request_notifications(message_id) where message_id is not null;
create function public.preserve_message_notification() returns trigger language plpgsql set search_path='' as $$
begin
 if old.kind='message_received' then new.invalidated_at:=old.invalidated_at;end if;return new;
end;$$;
create trigger preserve_message_alert before update of invalidated_at on public.request_notifications for each row execute function public.preserve_message_notification();

create function public.send_request_message(p_id uuid,p_request_id uuid,p_body text) returns public.request_messages language plpgsql security definer set search_path='' as $$
declare r public.tailoring_requests;m public.request_messages;normalized text;next_sequence integer;
begin
 select * into r from public.tailoring_requests where id=p_request_id for update;
 if auth.uid() is null or not found or auth.uid() not in(r.customer_id,r.tailor_id) then raise exception 'Conversation unavailable.' using errcode='42501';end if;
 normalized:=public.trim_request_message(p_body);
 if p_id is null or normalized is null or char_length(normalized) not between 1 and 2000 then raise exception 'Enter a message of 1 to 2,000 characters.' using errcode='22023';end if;
 -- Exact retries return the original row even if the request became terminal.
 select * into m from public.request_messages where id=p_id;
 if found then
  if m.request_id=p_request_id and m.sender_id=auth.uid() and m.body=normalized then return m;end if;
  raise exception 'This message identifier was already used.' using errcode='22023';
 end if;
 if r.status not in('pending','accepted') or r.completed_at is not null then raise exception 'This conversation is read-only because the request has ended.' using errcode='22023';end if;
 select coalesce(max(sequence),0)+1 into next_sequence from public.request_messages where request_id=p_request_id;
 insert into public.request_messages(id,request_id,sequence,sender_id,body) values(p_id,p_request_id,next_sequence,auth.uid(),normalized) returning * into m;
 insert into public.request_notifications(recipient_id,request_id,kind,message_id) values(case when auth.uid()=r.customer_id then r.tailor_id else r.customer_id end,r.id,'message_received',m.id);
 return m;
end;$$;

create function public.mark_request_messages_read(p_request_id uuid,p_sequence integer) returns integer language plpgsql security definer set search_path='' as $$
declare r public.tailoring_requests;result integer;
begin
 select * into r from public.tailoring_requests where id=p_request_id for share;
 if auth.uid() is null or not found or auth.uid() not in(r.customer_id,r.tailor_id) then raise exception 'Conversation unavailable.' using errcode='42501';end if;
 if p_sequence is null or p_sequence<1 or not exists(select 1 from public.request_messages where request_id=p_request_id and sequence=p_sequence) then raise exception 'Choose a message from this conversation.' using errcode='22023';end if;
 insert into public.request_message_reads(request_id,participant_id,last_read_sequence) values(r.id,auth.uid(),p_sequence)
 on conflict(request_id,participant_id) do update set last_read_sequence=greatest(public.request_message_reads.last_read_sequence,excluded.last_read_sequence),read_at=clock_timestamp() returning last_read_sequence into result;
 update public.request_notifications n set read_at=coalesce(n.read_at,clock_timestamp()) from public.request_messages m
 where n.message_id=m.id and n.recipient_id=auth.uid() and m.request_id=r.id and m.sequence<=result;
 return result;
end;$$;

create function public.request_message_summaries(p_request_ids uuid[]) returns table(request_id uuid,unread integer,last_read_sequence integer,latest_sequence integer)
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Sign in to view conversations.' using errcode='42501';end if;
 if p_request_ids is null or cardinality(p_request_ids)>100 then raise exception 'Choose up to 100 requests.' using errcode='22023';end if;
 return query select r.id,count(m.id) filter(where m.sender_id<>auth.uid() and m.sequence>coalesce(rd.last_read_sequence,0))::integer,coalesce(rd.last_read_sequence,0),coalesce(max(m.sequence),0)
 from public.tailoring_requests r left join public.request_message_reads rd on rd.request_id=r.id and rd.participant_id=auth.uid()
 left join public.request_messages m on m.request_id=r.id
 where r.id=any(p_request_ids) and auth.uid() in(r.customer_id,r.tailor_id)
 group by r.id,rd.last_read_sequence;
end;$$;
revoke all on function public.trim_request_message(text),public.preserve_message_notification(),public.send_request_message(uuid,uuid,text),public.mark_request_messages_read(uuid,integer),public.request_message_summaries(uuid[]) from public,anon,authenticated;
grant execute on function public.send_request_message(uuid,uuid,text),public.mark_request_messages_read(uuid,integer),public.request_message_summaries(uuid[]) to authenticated;

-- Hosted Supabase normally owns this publication. Do not create it in fixtures
-- or replace a project's existing publication configuration.
do $$declare tbl text;begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') then
  foreach tbl in array array['request_messages','request_message_reads','tailoring_requests'] loop
   if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=tbl) then execute format('alter publication supabase_realtime add table public.%I',tbl);end if;
  end loop;
 end if;
end;$$;
commit;
