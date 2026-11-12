begin;
alter table public.tailoring_requests add column payment_revision integer not null default 0 check(payment_revision>=0);
create table public.tailor_bank_accounts(
 owner_id uuid primary key references auth.users(id),account_holder text not null,bank text not null,branch text not null,account_number text not null,
 version integer not null default 1,updated_at timestamptz not null default clock_timestamp(),
 check(char_length(account_holder) between 1 and 150 and char_length(bank) between 1 and 150 and char_length(branch) between 1 and 150),
 check(account_number ~ '^[0-9]{3,40}$')
);
alter table public.tailor_bank_accounts enable row level security;
revoke all on public.tailor_bank_accounts from public,anon,authenticated;grant select on public.tailor_bank_accounts to authenticated;
create policy bank_eligible_read on public.tailor_bank_accounts for select to authenticated using(owner_id=auth.uid() or exists(select 1 from public.tailoring_requests r join public.request_quote_agreements a on a.request_id=r.id where r.tailor_id=owner_id and r.customer_id=auth.uid() and r.status='accepted'));
create function public.save_tailor_bank(p_fields jsonb,p_expected_version integer) returns public.tailor_bank_accounts language plpgsql security definer set search_path='' as $$
declare b public.tailor_bank_accounts;holder text;bank_name text;branch_name text;number text;
begin
 perform 1 from public.user_roles where user_id=auth.uid() and role='tailor' for update;
 if not found then raise exception 'Only tailors can manage their bank details.' using errcode='42501';end if;
 if p_fields is null or jsonb_typeof(p_fields)<>'object' or (p_fields-array['account_holder','bank','branch','account_number'])<>'{}'::jsonb then raise exception 'Supply only account holder, bank, branch and account number.' using errcode='22023';end if;
 if exists(select 1 from jsonb_each(p_fields) where jsonb_typeof(value)<>'string') then raise exception 'Bank details must be text.' using errcode='22023';end if;
 holder:=public.trim_request_message(p_fields->>'account_holder');bank_name:=public.trim_request_message(p_fields->>'bank');branch_name:=public.trim_request_message(p_fields->>'branch');number:=public.trim_request_message(p_fields->>'account_number');
 if holder is null or bank_name is null or branch_name is null or number is null or char_length(holder) not between 1 and 150 or char_length(bank_name) not between 1 and 150 or char_length(branch_name) not between 1 and 150 or number !~ '^[0-9]{3,40}$' then raise exception 'Enter holder, bank and branch (1–150 characters), and an account number of 3–40 digits. Leading zeros are preserved.' using errcode='22023';end if;
 select * into b from public.tailor_bank_accounts where owner_id=auth.uid() for update;
 if found then
  if b.version=coalesce(p_expected_version,0)+1 and (b.account_holder,b.bank,b.branch,b.account_number)=(holder,bank_name,branch_name,number) then return b;end if;
  if b.version is distinct from p_expected_version then raise exception 'Bank details changed. Reload before editing.' using errcode='40001';end if;
  update public.tailor_bank_accounts set account_holder=holder,bank=bank_name,branch=branch_name,account_number=number,version=version+1,updated_at=clock_timestamp() where owner_id=auth.uid() returning * into b;
 else
  if p_expected_version is not null then raise exception 'Bank details changed. Reload before editing.' using errcode='40001';end if;
  insert into public.tailor_bank_accounts(owner_id,account_holder,bank,branch,account_number) values(auth.uid(),holder,bank_name,branch_name,number) returning * into b;
 end if;return b;
end;$$;
create table public.request_payments(
 id uuid primary key,request_id uuid not null references public.tailoring_requests(id),customer_id uuid not null references auth.users(id),quote_id uuid not null references public.request_quotations(id),
 method text not null check(method in('bank_transfer','cash')),amount numeric(14,2) not null check(amount>0),paid_on date not null,reference text not null default '',
 receipt_id uuid unique,receipt_path text,destination jsonb,bank_version integer,created_at timestamptz not null default clock_timestamp(),
 check((method='cash' and receipt_id is null and receipt_path is null and destination is null and bank_version is null and reference='') or (method='bank_transfer' and receipt_id is not null and receipt_path is not null and destination is not null and bank_version is not null and char_length(reference) between 1 and 200))
);
create table public.request_payment_decisions(
 payment_id uuid primary key references public.request_payments(id),request_id uuid not null references public.tailoring_requests(id),
 status text not null check(status in('confirmed','rejected')),reason text not null default '',actor_id uuid not null references auth.users(id),decided_at timestamptz not null default clock_timestamp(),
 check((status='confirmed' and reason='') or (status='rejected' and char_length(reason) between 1 and 2000))
);
alter table public.request_payments enable row level security;alter table public.request_payment_decisions enable row level security;
revoke all on public.request_payments,public.request_payment_decisions from public,anon,authenticated;
grant select on public.request_payments,public.request_payment_decisions to authenticated;
create policy payment_participants on public.request_payments for select to authenticated using(exists(select 1 from public.tailoring_requests r where r.id=request_id and auth.uid() in(r.customer_id,r.tailor_id)));
create policy payment_decision_participants on public.request_payment_decisions for select to authenticated using(exists(select 1 from public.tailoring_requests r where r.id=request_id and auth.uid() in(r.customer_id,r.tailor_id)));
create view public.payment_details with(security_invoker=true) as select p.id,p.request_id,p.quote_id,p.method,p.amount::text,p.paid_on,p.reference,p.receipt_path,p.destination,p.created_at,coalesce(d.status,'pending') as status,d.reason,d.decided_at,d.actor_id,case when d.payment_id is null then 1 else 2 end as version from public.request_payments p left join public.request_payment_decisions d on d.payment_id=p.id;
revoke all on public.payment_details from public,anon,authenticated;grant select on public.payment_details to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('request-payment-receipts','request-payment-receipts',false,5242880,array['image/jpeg','image/png','image/webp','application/pdf']);
create table public.payment_receipt_uploads(
 id uuid primary key,owner_id uuid not null references auth.users(id),request_id uuid not null references public.tailoring_requests(id),draft_id uuid not null,
 image_path text not null unique,created_at timestamptz not null default clock_timestamp(),payment_id uuid unique references public.request_payments(id),
 check(image_path ~ ('^'||owner_id::text||'/receipts/'||request_id::text||'/'||draft_id::text||'/'||id::text||'\.(jpg|png|webp|pdf)$'))
);
alter table public.request_payments add constraint payment_receipt_fk foreign key(receipt_id) references public.payment_receipt_uploads(id);
alter table public.payment_receipt_uploads enable row level security;revoke all on public.payment_receipt_uploads from public,anon,authenticated;grant select on public.payment_receipt_uploads to authenticated;
create policy receipt_draft_owner on public.payment_receipt_uploads for select to authenticated using(owner_id=auth.uid());
create function public.valid_payment_receipt(path text,meta jsonb,preliminary boolean default false) returns boolean language plpgsql immutable set search_path='' as $$
begin
 if preliminary and not(meta ? 'size') and meta ? 'contentLength' then meta:=meta||jsonb_build_object('size',meta->'contentLength');end if;
 return public.valid_reference_file(path,meta) or coalesce(path ~ '\.pdf$' and meta->>'mimetype'='application/pdf' and case when meta->>'size' ~ '^[0-9]{1,10}$' then (meta->>'size')::numeric between 1 and 5242880 else false end,false);
end;$$;
create function public.reserve_payment_receipt(p_id uuid,p_request_id uuid,p_draft_id uuid,p_extension text) returns public.payment_receipt_uploads language plpgsql security definer set search_path='' as $$
declare r public.tailoring_requests;u public.payment_receipt_uploads;path text;
begin
 select * into r from public.tailoring_requests where id=p_request_id for update;
 if auth.uid() is null or not found or r.customer_id<>auth.uid() then raise exception 'Only the request customer can upload a payment receipt.' using errcode='42501';end if;
 if r.status<>'accepted' or not exists(select 1 from public.request_quote_agreements where request_id=r.id) then raise exception 'An accepted quotation is required.' using errcode='22023';end if;
 if p_id is null or p_draft_id is null or p_extension is null or p_extension not in('jpg','png','webp','pdf') then raise exception 'Choose a JPEG, PNG, WebP or PDF receipt.' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||':'||p_draft_id::text,252));
 path:=auth.uid()::text||'/receipts/'||r.id::text||'/'||p_draft_id::text||'/'||p_id::text||'.'||p_extension;
 select * into u from public.payment_receipt_uploads where id=p_id;
 if found then if u.owner_id=auth.uid() and u.image_path=path and u.payment_id is null then return u;end if;raise exception 'Receipt identifier unavailable.' using errcode='22023';end if;
 if exists(select 1 from public.request_payments where id=p_draft_id) or exists(select 1 from public.payment_receipt_uploads where owner_id=auth.uid() and draft_id=p_draft_id) then raise exception 'One receipt per payment. Remove the unused receipt first.' using errcode='22023';end if;
 insert into public.payment_receipt_uploads(id,owner_id,request_id,draft_id,image_path) values(p_id,auth.uid(),r.id,p_draft_id,path) returning * into u;return u;
end;$$;
create function public.payment_receipt_write_allowed(path text,meta jsonb) returns boolean language plpgsql volatile security definer set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtextextended(path,25));
 return public.valid_payment_receipt(path,meta,true) and exists(select 1 from public.payment_receipt_uploads u join public.tailoring_requests r on r.id=u.request_id join public.request_quote_agreements a on a.request_id=r.id where u.owner_id=auth.uid() and r.customer_id=auth.uid() and r.status='accepted' and u.image_path=path and u.payment_id is null and not exists(select 1 from public.request_payments where id=u.draft_id));
end;$$;
create function public.payment_receipt_read_allowed(path text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.payment_receipt_uploads u join public.tailoring_requests r on r.id=u.request_id where u.image_path=path and (u.owner_id=auth.uid() or (u.payment_id is not null and r.tailor_id=auth.uid())))
$$;
create function public.payment_receipt_delete_allowed(path text) returns boolean language plpgsql volatile security definer set search_path='' as $$
begin perform pg_advisory_xact_lock(hashtextextended(path,25));return exists(select 1 from public.payment_receipt_uploads where owner_id=auth.uid() and image_path=path and payment_id is null);end;$$;
create function public.payment_receipt_ready(p_id uuid) returns boolean language plpgsql security definer set search_path='' as $$
declare u public.payment_receipt_uploads;begin select * into u from public.payment_receipt_uploads where id=p_id and owner_id=auth.uid();if not found then raise exception 'Receipt unavailable.' using errcode='42501';end if;
 return exists(select 1 from storage.objects o where o.bucket_id='request-payment-receipts' and o.name=u.image_path and public.valid_payment_receipt(o.name,o.metadata));end;$$;
create function public.release_payment_receipt(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare u public.payment_receipt_uploads;begin
 perform 1 from public.tailoring_requests where id=(select request_id from public.payment_receipt_uploads where id=p_id and owner_id=auth.uid()) for update;
 select * into u from public.payment_receipt_uploads where id=p_id and owner_id=auth.uid() for update;if not found then return;end if;
 perform pg_advisory_xact_lock(hashtextextended(u.image_path,25));
 if u.payment_id is not null then raise exception 'Submitted receipts are immutable.' using errcode='22023';end if;
 if exists(select 1 from storage.objects where bucket_id='request-payment-receipts' and name=u.image_path) then raise exception 'Remove the unused receipt through Storage first.' using errcode='22023';end if;
 delete from public.payment_receipt_uploads where id=u.id;end;$$;
create function public.unused_payment_receipts(p_exclude_draft uuid default null) returns setof public.payment_receipt_uploads language sql security definer set search_path='' as $$select u.* from public.payment_receipt_uploads u where owner_id=auth.uid() and payment_id is null and created_at<now()-interval '1 hour' and (p_exclude_draft is null or draft_id<>p_exclude_draft) order by created_at,id limit 100$$;
create policy receipt_insert on storage.objects for insert to authenticated with check(bucket_id='request-payment-receipts' and public.payment_receipt_write_allowed(name,metadata));
create policy receipt_read on storage.objects for select to authenticated using(bucket_id='request-payment-receipts' and public.payment_receipt_read_allowed(name));
create policy receipt_delete on storage.objects for delete to authenticated using(bucket_id='request-payment-receipts' and public.payment_receipt_delete_allowed(name));
create policy receipt_insert_guard on storage.objects as restrictive for insert to anon,authenticated with check(case when bucket_id<>'request-payment-receipts' then true when auth.uid() is null then false else public.payment_receipt_write_allowed(name,metadata) end);
create policy receipt_read_guard on storage.objects as restrictive for select to anon,authenticated using(case when bucket_id<>'request-payment-receipts' then true when auth.uid() is null then false else public.payment_receipt_read_allowed(name) end);
create policy receipt_delete_guard on storage.objects as restrictive for delete to anon,authenticated using(case when bucket_id<>'request-payment-receipts' then true when auth.uid() is null then false else public.payment_receipt_delete_allowed(name) end);
create policy receipt_no_update on storage.objects as restrictive for update to anon,authenticated using(bucket_id<>'request-payment-receipts') with check(bucket_id<>'request-payment-receipts');

alter table public.request_notifications add column payment_id uuid references public.request_payments(id);
alter table public.request_notifications drop constraint request_notifications_kind_check,drop constraint notification_event_shape;
alter table public.request_notifications add constraint request_notifications_kind_check check(kind in('two_days','due_today','quote_sent','quote_accepted','quote_declined','stage_changed','message_received','design_proposed','design_accepted','design_declined','design_withdrawn','payment_reported','payment_confirmed','payment_rejected')),
add constraint notification_event_shape check(
 (kind in('two_days','due_today') and quote_id is null and revision is not null and confirmed_date is not null and progress_event_id is null and message_id is null and proposal_id is null and payment_id is null)
 or (kind in('quote_sent','quote_accepted','quote_declined') and quote_id is not null and revision is null and confirmed_date is null and progress_event_id is null and message_id is null and proposal_id is null and payment_id is null)
 or (kind='stage_changed' and quote_id is null and revision is null and confirmed_date is null and progress_event_id is not null and message_id is null and proposal_id is null and payment_id is null)
 or (kind='message_received' and quote_id is null and revision is null and confirmed_date is null and progress_event_id is null and message_id is not null and proposal_id is null and payment_id is null)
 or (kind in('design_proposed','design_accepted','design_declined','design_withdrawn') and quote_id is null and revision is null and confirmed_date is null and progress_event_id is null and message_id is null and proposal_id is not null and payment_id is null)
 or (kind in('payment_reported','payment_confirmed','payment_rejected') and quote_id is null and revision is null and confirmed_date is null and progress_event_id is null and message_id is null and proposal_id is null and payment_id is not null));
create unique index payment_notification_once on public.request_notifications(payment_id,kind) where payment_id is not null;
create function public.preserve_payment_notification() returns trigger language plpgsql set search_path='' as $$begin if old.payment_id is not null then new.invalidated_at:=old.invalidated_at;end if;return new;end;$$;
create trigger preserve_payment_alert before update of invalidated_at on public.request_notifications for each row execute function public.preserve_payment_notification();

create function public.report_request_payment(p_id uuid,p_request_id uuid,p_quote_id uuid,p_method text,p_amount text,p_paid_on date,p_reference text,p_receipt_id uuid default null,p_bank_version integer default null) returns uuid language plpgsql security definer set search_path='' as $$
declare r public.tailoring_requests;a public.request_quote_agreements;p public.request_payments;u public.payment_receipt_uploads;b public.tailor_bank_accounts;n numeric;ref text:=public.trim_request_message(coalesce(p_reference,''));dest jsonb;
begin
 select * into r from public.tailoring_requests where id=p_request_id for update;
 if auth.uid() is null or not found or r.customer_id<>auth.uid() then raise exception 'Only the request customer can report payment.' using errcode='42501';end if;
 if p_id is null or p_method is null or p_method not in('bank_transfer','cash') or p_amount is null or p_amount !~ '^[0-9]{1,12}(\.[0-9]{1,2})?$' then raise exception 'Enter a positive LKR amount with up to two decimal places.' using errcode='22023';end if;
 n:=p_amount::numeric;if n<=0 or n>999999999999.99 or p_paid_on is null or p_paid_on<'1900-01-01'::date or p_paid_on>(clock_timestamp() at time zone 'Asia/Colombo')::date then raise exception 'Use a positive amount and an actual payment date (1900 or later, not in the future).' using errcode='22023';end if;
 if (p_method='cash' and (ref<>'' or p_receipt_id is not null or p_bank_version is not null)) or (p_method='bank_transfer' and (char_length(ref) not between 1 and 200 or p_receipt_id is null or p_bank_version is null)) then raise exception 'Bank transfers need a reference (1–200 characters), receipt and reviewed bank details. Cash needs only amount and date.' using errcode='22023';end if;
 select * into p from public.request_payments where id=p_id;
 if found then
  if p.request_id=r.id and p.customer_id=auth.uid() and p.quote_id=p_quote_id and p.method=p_method and p.amount=n and p.paid_on=p_paid_on and p.reference=ref and p.receipt_id is not distinct from p_receipt_id and p.bank_version is not distinct from p_bank_version then return p.id;end if;
  raise exception 'Payment identifier already used with different details.' using errcode='22023';
 end if;
 select * into a from public.request_quote_agreements where request_id=r.id;
 if not found or r.status<>'accepted' or a.quote_id is distinct from p_quote_id or a.currency<>'LKR' then raise exception 'An accepted LKR quotation is required. Refresh its agreement.' using errcode='22023';end if;
 if n>a.total-coalesce((select sum(x.amount) from public.request_payments x join public.request_payment_decisions d on d.payment_id=x.id and d.status='confirmed' where x.request_id=r.id),0) then raise exception 'The reported amount exceeds the remaining confirmed balance. Refresh payments.' using errcode='22023';end if;
 if p_method='bank_transfer' then
  select * into b from public.tailor_bank_accounts where owner_id=r.tailor_id for share;
  if not found or b.version is distinct from p_bank_version then raise exception 'Destination bank details changed or are unavailable. Review them again before submitting.' using errcode='40001';end if;
  dest:=jsonb_build_object('account_holder',b.account_holder,'bank',b.bank,'branch',b.branch,'account_number',b.account_number);
  select * into u from public.payment_receipt_uploads where id=p_receipt_id for update;
  if not found or u.owner_id<>auth.uid() or u.request_id<>r.id or u.draft_id<>p_id or u.payment_id is not null then raise exception 'Choose your own unused receipt for this payment.' using errcode='42501';end if;
  perform pg_advisory_xact_lock(hashtextextended(u.image_path,25));
  perform 1 from storage.objects o where o.bucket_id='request-payment-receipts' and o.name=u.image_path and public.valid_payment_receipt(o.name,o.metadata) for share;
  if not found then raise exception 'Receipt file missing or invalid. Retry the upload.' using errcode='22023';end if;
 end if;
 insert into public.request_payments(id,request_id,customer_id,quote_id,method,amount,paid_on,reference,receipt_id,receipt_path,destination,bank_version) values(p_id,r.id,auth.uid(),a.quote_id,p_method,n,p_paid_on,ref,p_receipt_id,u.image_path,dest,p_bank_version);
 if p_receipt_id is not null then update public.payment_receipt_uploads set payment_id=p_id where id=p_receipt_id;end if;
 update public.tailoring_requests set payment_revision=payment_revision+1 where id=r.id;
 insert into public.request_notifications(recipient_id,request_id,kind,payment_id) values(r.tailor_id,r.id,'payment_reported',p_id);
 return p_id;
end;$$;
create function public.decide_request_payment(p_id uuid,p_status text,p_reason text,p_expected_version integer,p_confirm_received boolean default false) returns uuid language plpgsql security definer set search_path='' as $$
declare r public.tailoring_requests;p public.request_payments;d public.request_payment_decisions;a public.request_quote_agreements;reason text:=public.trim_request_message(coalesce(p_reason,''));received numeric;
begin
 select * into r from public.tailoring_requests where id=(select request_id from public.request_payments where id=p_id) for update;
 if auth.uid() is null or not found or r.tailor_id<>auth.uid() or not exists(select 1 from public.user_roles where user_id=auth.uid() and role='tailor') then raise exception 'Only the addressed tailor can verify payment receipt.' using errcode='42501';end if;
 if p_status is null or p_status not in('confirmed','rejected') or (p_status='rejected' and char_length(reason) not between 1 and 2000) or (p_status='confirmed' and (p_confirm_received is distinct from true or reason<>'')) then raise exception 'Explicitly check receipt of funds before confirming, or reject with a reason (1–2,000 characters).' using errcode='22023';end if;
 select * into p from public.request_payments where id=p_id;
 select * into d from public.request_payment_decisions where payment_id=p.id;
 if found then if d.status=p_status and d.reason=reason and d.actor_id=auth.uid() and p_expected_version=1 then return p.id;end if;raise exception 'Payment already decided. Refresh history.' using errcode='40001';end if;
 if p_expected_version is distinct from 1 then raise exception 'Payment changed. Refresh before verifying.' using errcode='40001';end if;
 select * into a from public.request_quote_agreements where request_id=r.id;
 if not found or a.quote_id<>p.quote_id or r.status<>'accepted' then raise exception 'An accepted quotation is required for payment verification.' using errcode='22023';end if;
 if p_status='confirmed' then
  select coalesce(sum(x.amount),0) into received from public.request_payments x join public.request_payment_decisions y on y.payment_id=x.id and y.status='confirmed' where x.request_id=r.id;
  if received+p.amount>a.total then raise exception 'Confirming this would exceed the agreed total. Refresh the balance; reject any duplicate report with an explanation.' using errcode='22023';end if;
 end if;
 insert into public.request_payment_decisions(payment_id,request_id,status,reason,actor_id) values(p.id,r.id,p_status,reason,auth.uid());
 update public.tailoring_requests set payment_revision=payment_revision+1 where id=r.id;
 insert into public.request_notifications(recipient_id,request_id,kind,payment_id) values(r.customer_id,r.id,'payment_'||p_status,p.id);
 return p.id;
end;$$;
create function public.request_payment_state(p_request_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare r public.tailoring_requests;result jsonb;
begin
 select * into r from public.tailoring_requests where id=p_request_id;
 if auth.uid() is null or not found or auth.uid() not in(r.customer_id,r.tailor_id) then raise exception 'Payment records unavailable.' using errcode='42501';end if;
 select jsonb_build_object('eligible',a.request_id is not null and r.status='accepted','quote_id',a.quote_id,'total',a.total::text,
 'confirmed',coalesce(t.confirmed,0)::numeric(14,2)::text,'awaiting',coalesce(t.awaiting,0.00)::text,'balance',(a.total-coalesce(t.confirmed,0))::numeric(14,2)::text,
 'bank',case when a.request_id is not null and r.status='accepted' then (select to_jsonb(b) from public.tailor_bank_accounts b where owner_id=r.tailor_id) else null end,
 'payments',coalesce((select jsonb_agg(to_jsonb(d) order by d.created_at desc,d.id) from public.payment_details d where d.request_id=r.id),'[]')) into result
 from (select 1) seed left join public.request_quote_agreements a on a.request_id=r.id
 left join lateral(select sum(p.amount) filter(where d.status='confirmed') as confirmed,sum(p.amount) filter(where d.payment_id is null) as awaiting from public.request_payments p left join public.request_payment_decisions d on d.payment_id=p.id where p.request_id=r.id)t on true;
 return result;
end;$$;
revoke all on function public.save_tailor_bank(jsonb,integer),public.valid_payment_receipt(text,jsonb,boolean),public.reserve_payment_receipt(uuid,uuid,uuid,text),public.payment_receipt_write_allowed(text,jsonb),public.payment_receipt_read_allowed(text),public.payment_receipt_delete_allowed(text),public.payment_receipt_ready(uuid),public.release_payment_receipt(uuid),public.unused_payment_receipts(uuid),public.preserve_payment_notification(),public.report_request_payment(uuid,uuid,uuid,text,text,date,text,uuid,integer),public.decide_request_payment(uuid,text,text,integer,boolean),public.request_payment_state(uuid) from public,anon,authenticated;
grant execute on function public.save_tailor_bank(jsonb,integer),public.reserve_payment_receipt(uuid,uuid,uuid,text),public.payment_receipt_write_allowed(text,jsonb),public.payment_receipt_read_allowed(text),public.payment_receipt_delete_allowed(text),public.payment_receipt_ready(uuid),public.release_payment_receipt(uuid),public.unused_payment_receipts(uuid),public.report_request_payment(uuid,uuid,uuid,text,text,date,text,uuid,integer),public.decide_request_payment(uuid,text,text,integer,boolean),public.request_payment_state(uuid) to authenticated;
commit;
