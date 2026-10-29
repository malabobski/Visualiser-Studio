-- Creator-only broadcasts use the existing private notification inboxes.
begin;
create table if not exists public.community_notification_broadcasts (
  id uuid primary key,
  title text not null,
  body text not null,
  recipient_count integer not null,
  created_at timestamptz not null default now()
);
alter table public.community_notification_broadcasts enable row level security;
revoke all on public.community_notification_broadcasts from public,anon,authenticated;

create or replace function public.community_admin_notify_all(request_id uuid,notification_title text,message_body text)
returns integer language plpgsql security definer set search_path='' as $$
declare previous public.community_notification_broadcasts; recipients integer;
begin
  if not public.community_admin_status() then raise exception 'Admin access required.'; end if;
  if request_id is null then raise exception 'Start a new notification.'; end if;
  if notification_title is null or char_length(btrim(notification_title)) not between 1 and 80
    or message_body is null or char_length(btrim(message_body)) not between 1 and 500 then
    raise exception 'Add a title (up to 80 characters) and message (up to 500).';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(request_id::text,2));
  select * into previous from public.community_notification_broadcasts where id=request_id;
  if found then
    if previous.title<>btrim(notification_title) or previous.body<>btrim(message_body) then
      raise exception 'This notification was already sent with different text. Start a new notification.';
    end if;
    return previous.recipient_count;
  end if;
  insert into public.community_notifications(recipient_id,title,body)
    select id,btrim(notification_title),btrim(message_body) from public.profiles;
  get diagnostics recipients=row_count;
  insert into public.community_notification_broadcasts(id,title,body,recipient_count)
    values(request_id,btrim(notification_title),btrim(message_body),recipients);
  return recipients;
end $$;
revoke all on function public.community_admin_notify_all(uuid,text,text) from public,anon;
grant execute on function public.community_admin_notify_all(uuid,text,text) to authenticated;
commit;
