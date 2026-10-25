-- Ready-to-run social setup. Paste this complete file into Supabase SQL Editor.
-- Generated from migration 005 and community-message-expiry.sql.

-- Run after 004. Adds private delivery queues, opt-in activity and profile cards.
begin;
create table if not exists public.community_activity (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  sharing boolean not null default false,
  activity text not null default '' check(char_length(activity)<=180),
  updated_at timestamptz not null default now()
);
create table if not exists public.community_blocks (
  owner_id uuid references public.profiles(id) on delete cascade,
  target_id uuid references public.profiles(id) on delete cascade,
  primary key(owner_id,target_id), check(owner_id<>target_id)
);
create table if not exists public.community_dm_receipts (
  id uuid primary key, sender_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);
create table if not exists public.community_messages (
  id uuid primary key references public.community_dm_receipts(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check(char_length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now()+interval '30 days',
  check(sender_id<>recipient_id)
);
create index if not exists community_messages_inbox on public.community_messages(recipient_id,sender_id,created_at,id);
create index if not exists community_messages_expiry on public.community_messages(expires_at);
create index if not exists community_dm_receipts_expiry on public.community_dm_receipts(created_at);
alter table public.community_activity enable row level security;
alter table public.community_blocks enable row level security;
alter table public.community_dm_receipts enable row level security;
alter table public.community_messages enable row level security;
revoke all on public.community_activity,public.community_blocks,public.community_dm_receipts,public.community_messages from public,anon,authenticated;

create or replace function public.community_social_settings()
returns boolean language sql stable security definer set search_path='' as $$
  select coalesce((select sharing from public.community_activity where user_id=auth.uid()),false);
$$;
create or replace function public.community_set_activity(shared boolean, description text default '')
returns void language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  if description is null or char_length(description)>180 then raise exception 'Activity is too long.'; end if;
  insert into public.community_activity(user_id,sharing,activity) values(auth.uid(),shared,case when shared then description else '' end)
  on conflict(user_id) do update set sharing=excluded.sharing,activity=excluded.activity,updated_at=now();
end $$;
create or replace function public.community_friend_activity()
returns table(person_id uuid,activity text) language sql stable security definer set search_path='' as $$
  select a.user_id,a.activity from public.community_activity a
  where auth.uid() is not null and a.sharing and a.updated_at>now()-interval '90 seconds'
    and exists(select 1 from public.friendships f where f.status='accepted' and
      ((f.sender_id=auth.uid() and f.recipient_id=a.user_id) or (f.recipient_id=auth.uid() and f.sender_id=a.user_id)))
    and not exists(select 1 from public.community_blocks b where
      (b.owner_id=auth.uid() and b.target_id=a.user_id) or (b.target_id=auth.uid() and b.owner_id=a.user_id));
$$;
create or replace function public.community_person(target_username text)
returns table(id uuid,username text,display_name text,bio text,relationship jsonb,activity text,blocked boolean)
language sql stable security definer set search_path='' as $$
  select p.id,p.username,p.display_name,p.bio,
    (select jsonb_build_object('id',f.id,'status',f.status,'direction',case when f.sender_id=auth.uid() then 'outgoing' else 'incoming' end)
      from public.friendships f where p.id<>auth.uid() and auth.uid() in(f.sender_id,f.recipient_id) and p.id in(f.sender_id,f.recipient_id)),
    coalesce((select a.activity from public.community_friend_activity() a where a.person_id=p.id),''),
    exists(select 1 from public.community_blocks b where b.owner_id=auth.uid() and b.target_id=p.id)
  from public.profiles p where auth.uid() is not null and p.username=lower(btrim(target_username));
$$;
-- Guard requests too, including requests made through older versions of the app.
create or replace function public.community_guard_blocked_friendship()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(least(new.sender_id,new.recipient_id)::text||greatest(new.sender_id,new.recipient_id)::text,1));
  if exists(select 1 from public.community_blocks b where
    (b.owner_id=new.sender_id and b.target_id=new.recipient_id) or (b.owner_id=new.recipient_id and b.target_id=new.sender_id))
  then raise exception 'This connection is unavailable.'; end if;
  return new;
end $$;
drop trigger if exists community_blocked_friendship on public.friendships;
create trigger community_blocked_friendship before insert or update on public.friendships for each row execute function public.community_guard_blocked_friendship();
create or replace function public.community_block_person(target uuid, blocked boolean)
returns void language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null or target=auth.uid() then raise exception 'Choose another member.'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(least(auth.uid(),target)::text||greatest(auth.uid(),target)::text,1));
  if blocked then
    insert into public.community_blocks values(auth.uid(),target) on conflict do nothing;
    delete from public.friendships where auth.uid() in(sender_id,recipient_id) and target in(sender_id,recipient_id);
    delete from public.community_messages where auth.uid() in(sender_id,recipient_id) and target in(sender_id,recipient_id);
  else delete from public.community_blocks where owner_id=auth.uid() and target_id=target; end if;
end $$;

-- No client can directly read queued messages or delete somebody else's copy.
create or replace function public.community_dm_send(message_id uuid, target uuid, message_body text)
returns uuid language plpgsql security definer set search_path='' as $$
declare me uuid:=auth.uid(); previous public.community_dm_receipts;
begin
  if me is null then raise exception 'Sign in first.'; end if;
  if message_id is null or message_body is null or char_length(btrim(message_body)) not between 1 and 2000 then raise exception 'Write a message of up to 2,000 characters.'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(me::text,0));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(least(me,target)::text||greatest(me,target)::text,1));
  select * into previous from public.community_dm_receipts where id=message_id;
  if previous.id is not null then
    if previous.sender_id=me and previous.recipient_id=target then return message_id; end if;
    raise exception 'Choose a new message ID.';
  end if;
  if not exists(select 1 from public.friendships where status='accepted' and me in(sender_id,recipient_id) and target in(sender_id,recipient_id) and target<>me)
    or exists(select 1 from public.community_blocks where (owner_id=me and target_id=target) or(owner_id=target and target_id=me))
  then raise exception 'You can only message your friends.'; end if;
  if exists(select 1 from public.community_dm_receipts where sender_id=me and created_at>now()-interval '1 second') then raise exception 'Give it a moment before sending again.'; end if;
  insert into public.community_dm_receipts(id,sender_id,recipient_id) values(message_id,me,target);
  insert into public.community_messages(id,sender_id,recipient_id,body) values(message_id,me,target,btrim(message_body));
  return message_id;
end $$;
create or replace function public.community_dm_inbox()
returns table(person_id uuid,username text,display_name text,unread bigint)
language sql stable security definer set search_path='' as $$
  select p.id,p.username,p.display_name,count(*) from public.community_messages m join public.profiles p on p.id=m.sender_id
  where m.recipient_id=auth.uid() and m.expires_at>now() and not exists(select 1 from public.community_blocks b where
    (b.owner_id=auth.uid() and b.target_id=m.sender_id) or(b.owner_id=m.sender_id and b.target_id=auth.uid()))
  group by p.id,p.username,p.display_name order by max(m.created_at) desc limit 100;
$$;
create or replace function public.community_dm_receive(peer uuid)
returns table(id uuid,sender_id uuid,body text,created_at timestamptz)
language sql stable security definer set search_path='' as $$
  select m.id,m.sender_id,m.body,m.created_at from public.community_messages m
  where m.recipient_id=auth.uid() and m.sender_id=peer and m.expires_at>now()
    and not exists(select 1 from public.community_blocks b where (b.owner_id=auth.uid() and b.target_id=peer) or(b.owner_id=peer and b.target_id=auth.uid()))
  order by m.created_at,m.id limit 100;
$$;
create or replace function public.community_dm_ack(message_ids uuid[])
returns void language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  if coalesce(cardinality(message_ids),0)>100 then raise exception 'Too many messages.'; end if;
  delete from public.community_messages where recipient_id=auth.uid() and id=any(message_ids);
end $$;
-- Owner-only maintenance. A scheduled job removes expired rows even if nobody opens the app.
create or replace function public.community_expire_messages()
returns void language sql security definer set search_path='' as $$
  delete from public.community_messages where expires_at<=now();
  delete from public.community_dm_receipts where created_at<now()-interval '30 days';
$$;
revoke all on function public.community_expire_messages() from public,anon,authenticated;
revoke all on function public.community_guard_blocked_friendship() from public,anon,authenticated;
do $$ declare signature text; begin
  foreach signature in array array['community_social_settings()','community_set_activity(boolean,text)','community_friend_activity()',
    'community_person(text)','community_block_person(uuid,boolean)','community_dm_send(uuid,uuid,text)',
    'community_dm_inbox()','community_dm_receive(uuid)','community_dm_ack(uuid[])'] loop
    execute 'revoke all on function public.'||signature||' from public,anon';
    execute 'grant execute on function public.'||signature||' to authenticated';
  end loop;
end $$;
-- Preserve the existing feed API while allowing a saved template's name.
do $$ declare source text; begin
  source:=pg_get_functiondef('public.community_publish_post(text,jsonb)'::regprocedure);
  source:=replace(source,'''design'',''response'']','''design'',''response'',''template_name'']');
  source:=replace(source,'-- Only colour design values;',
    'if shared_look ? ''template_name'' and (jsonb_typeof(shared_look->''template_name'')<>''string'' or char_length(btrim(shared_look->>''template_name'')) not between 1 and 120) then raise exception ''Choose a template name of up to 120 characters.''; end if; -- Only colour design values;');
  execute source;
end $$;
commit;

-- Run once in Supabase SQL Editor after migration 005.
-- Supabase Cron performs expiry even while every client is closed.
create extension if not exists pg_cron;
select cron.schedule('community-dm-expiry','17 * * * *','select public.community_expire_messages();');
