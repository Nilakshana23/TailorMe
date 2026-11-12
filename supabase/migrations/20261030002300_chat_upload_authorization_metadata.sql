begin;
-- Storage's pre-upload permission INSERT uses {mimetype, contentLength};
-- the completed object uses {mimetype, size}. Validate either phase without
-- granting uploads without a positive bounded length or supported MIME.
-- ready/send still require actual completed metadata.size through 021's validator.
create function public.valid_chat_upload_metadata(path text,meta jsonb) returns boolean
language sql immutable set search_path='' as $$
 select public.valid_reference_file(path,case
  when meta ? 'size' then meta
  when meta ? 'contentLength' then meta||jsonb_build_object('size',meta->'contentLength')
  else meta end)
$$;
create or replace function public.chat_image_write_allowed(path text,meta jsonb) returns boolean
language plpgsql volatile security definer set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtextextended(path,22));
 return public.valid_chat_upload_metadata(path,meta) and exists(
  select 1 from public.chat_image_uploads u join public.tailoring_requests r on r.id=u.request_id
  where u.owner_id=auth.uid() and auth.uid() in(r.customer_id,r.tailor_id)
  and r.status in('pending','accepted') and r.completed_at is null
  and u.image_path=path and u.message_id is null);
end;$$;
revoke all on function public.valid_chat_upload_metadata(text,jsonb) from public,anon,authenticated;
-- Existing chat_image_write_allowed grants and all bucket guards are preserved.
commit;
