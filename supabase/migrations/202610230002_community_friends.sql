-- Run after the profiles migration. Safe to run again.
begin;

create table if not exists public.friendships (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  check (sender_id <> recipient_id)
);
create unique index if not exists friendships_pair on public.friendships
  (least(sender_id, recipient_id), greatest(sender_id, recipient_id));
create index if not exists friendships_recipient on public.friendships(recipient_id);
create index if not exists friendships_sender on public.friendships(sender_id);
alter table public.friendships enable row level security;
revoke all on public.friendships from public, anon, authenticated;
grant select on public.friendships to authenticated;
drop policy if exists "Members can view their own friendships" on public.friendships;
create policy "Members can view their own friendships" on public.friendships
  for select to authenticated using ((select auth.uid()) in (sender_id, recipient_id));

-- All writes go through these functions. There are no client INSERT/UPDATE/
-- DELETE grants, so callers cannot forge a sender or accept their own request.
create or replace function public.community_search_people(search_term text)
returns table (id uuid, username text, display_name text, bio text)
language plpgsql stable security definer set search_path = '' as $$
declare term text := lower(ltrim(btrim(search_term), '@'));
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  if term is null or term !~ '^[a-z0-9_]{3,24}$' then return; end if;
  return query select p.id, p.username, p.display_name, p.bio
    from public.profiles p where p.id <> auth.uid()
      and left(p.username, length(term)) = term
    order by (p.username = term) desc, p.username limit 12;
end $$;

create or replace function public.community_friends()
returns table (id uuid, status text, direction text, created_at timestamptz,
  person_id uuid, username text, display_name text, bio text)
language sql stable security definer set search_path = '' as $$
  select f.id, f.status,
    case when f.sender_id = auth.uid() then 'outgoing' else 'incoming' end,
    f.created_at, p.id, p.username, p.display_name, p.bio
  from public.friendships f join public.profiles p
    on p.id = case when f.sender_id = auth.uid() then f.recipient_id else f.sender_id end
  where auth.uid() in (f.sender_id, f.recipient_id)
  order by f.created_at desc;
$$;

create or replace function public.community_send_request(target_username text)
returns void language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); target uuid;
begin
  if me is null then raise exception 'Sign in first.'; end if;
  if not exists (select 1 from public.profiles where id = me) then
    raise exception 'Save your profile before adding friends.';
  end if;
  select id into target from public.profiles where username = lower(btrim(target_username));
  if target is null then raise exception 'That profile could not be found.'; end if;
  if target = me then raise exception 'You cannot add yourself.'; end if;
  insert into public.friendships (sender_id, recipient_id) values (me, target);
exception when unique_violation then
  raise exception 'You are already connected or have a pending request. Refresh your list.';
end $$;

create or replace function public.community_friend_action(request_id uuid, requested_action text)
returns void language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); item public.friendships;
begin
  if me is null then raise exception 'Sign in first.'; end if;
  select * into item from public.friendships where id = request_id for update;
  if item.id is null or me not in (item.sender_id, item.recipient_id) then
    raise exception 'This request is no longer available.';
  end if;
  if requested_action = 'accept' and item.status = 'pending' and item.recipient_id = me then
    update public.friendships set status = 'accepted' where id = item.id;
  elsif (requested_action = 'decline' and item.status = 'pending' and item.recipient_id = me)
     or (requested_action = 'cancel' and item.status = 'pending' and item.sender_id = me)
     or (requested_action = 'remove' and item.status = 'accepted') then
    delete from public.friendships where id = item.id;
  else raise exception 'This action is not available. Refresh your list.';
  end if;
end $$;

revoke all on function public.community_search_people(text) from public, anon;
revoke all on function public.community_friends() from public, anon;
revoke all on function public.community_send_request(text) from public, anon;
revoke all on function public.community_friend_action(uuid, text) from public, anon;
grant execute on function public.community_search_people(text) to authenticated;
grant execute on function public.community_friends() to authenticated;
grant execute on function public.community_send_request(text) to authenticated;
grant execute on function public.community_friend_action(uuid, text) to authenticated;
commit;
