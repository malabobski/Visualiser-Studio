-- Listening cards and creator broadcasts. Apply after the existing Community setup.
-- Structured listening activity follows the existing opt-in, friend and expiry rules.
begin;
alter table public.community_activity add column if not exists track jsonb;
alter table public.community_activity drop constraint if exists community_activity_track_size;
alter table public.community_activity add constraint community_activity_track_size
  check (track is null or (jsonb_typeof(track)='object' and octet_length(track::text)<=64000));

-- Older clients update only the description. Never retain artwork from a prior song.
create or replace function public.community_clear_previous_track()
returns trigger language plpgsql set search_path='' as $$
begin
  new.track=null;
  return new;
end $$;
drop trigger if exists community_clear_previous_track on public.community_activity;
create trigger community_clear_previous_track before insert or update of activity,sharing,updated_at
  on public.community_activity for each row execute function public.community_clear_previous_track();

create or replace function public.community_set_activity_v2(shared boolean, description text default '', track jsonb default null)
returns void language plpgsql security definer set search_path='' as $$
begin
  if track is not null and (jsonb_typeof(track)<>'object' or octet_length(track::text)>64000
    or jsonb_typeof(track->'title') is distinct from 'string' or char_length(track->>'title') not between 1 and 300
    or coalesce(char_length(track->>'artist'),0)>200 or coalesce(char_length(track->>'source'),0)>60
    or coalesce(char_length(track->>'artwork'),0)>60000) then raise exception 'Invalid song details.'; end if;
  perform public.community_set_activity(shared,description);
  update public.community_activity set track=case when shared then community_set_activity_v2.track else null end where user_id=auth.uid();
end $$;

create or replace function public.community_friend_activity_v2()
returns table(person_id uuid,activity text,track jsonb)
language sql stable security definer set search_path='' as $$
  select visible.person_id,visible.activity,a.track
  from public.community_friend_activity() visible join public.community_activity a on a.user_id=visible.person_id;
$$;
-- A browser heartbeat must not replace music actively shared by the desktop app.
create or replace function public.community_set_web_activity(shared boolean, description text default '')
returns void language plpgsql security definer set search_path='' as $$
declare current_activity public.community_activity;
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  select * into current_activity from public.community_activity where user_id=auth.uid() for update;
  if shared and current_activity.sharing and current_activity.updated_at>now()-interval '90 seconds'
    and current_activity.activity like 'Listening to %' then return; end if;
  perform public.community_set_activity(shared,description);
end $$;
revoke all on function public.community_set_activity_v2(boolean,text,jsonb),public.community_friend_activity_v2() from public,anon;
grant execute on function public.community_set_activity_v2(boolean,text,jsonb),public.community_friend_activity_v2() to authenticated;
revoke all on function public.community_set_web_activity(boolean,text) from public,anon;
grant execute on function public.community_set_web_activity(boolean,text) to authenticated;
commit;

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
