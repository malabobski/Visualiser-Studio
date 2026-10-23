-- Run after migrations 001, 002 and 003. Safe to run again.
begin;
create table if not exists public.community_posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('text','look','joined')),
  body text not null default '' check (char_length(body) <= 1000),
  look jsonb,
  created_at timestamptz not null default now(),
  check ((kind='text' and char_length(btrim(body))>0 and look is null)
    or (kind='joined' and body='' and look is null)
    or (kind='look' and jsonb_typeof(look)='object' and look is not null))
);
create index if not exists community_posts_order on public.community_posts(created_at desc,id desc);
create unique index if not exists community_posts_one_join on public.community_posts(author_id) where kind='joined';
alter table public.community_posts enable row level security;
revoke all on public.community_posts from public, anon, authenticated;
grant select on public.community_posts to authenticated;
drop policy if exists "Members can read the Community feed" on public.community_posts;
create policy "Members can read the Community feed" on public.community_posts for select to authenticated using (true);

-- Profile creation and an OPTIONAL introduction happen in one transaction.
-- There is no default announcement or automatic announcement for older users.
create or replace function public.community_create_profile(username text, display_name text, bio text, announce boolean default false)
returns setof public.profiles language plpgsql security definer set search_path='' as $$
declare me uuid:=auth.uid();
begin
  if me is null then raise exception 'Sign in first.'; end if;
  insert into public.profiles(id,username,display_name,bio) values(me,username,display_name,bio);
  if announce is true then insert into public.community_posts(author_id,kind) values(me,'joined'); end if;
  return query select * from public.profiles p where p.id=me;
end $$;

create or replace function public.community_publish_post(post_body text, shared_look jsonb default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare me uuid:=auth.uid(); post_id uuid;
begin
  if me is null then raise exception 'Sign in first.'; end if;
  if not exists(select 1 from public.profiles where id=me) then raise exception 'Save your profile before posting.'; end if;
  if post_body is null or char_length(post_body)>1000 or (shared_look is null and btrim(post_body)='') then
    raise exception 'Write a post of up to 1,000 characters or attach a look.';
  end if;
  if shared_look is not null then
    if jsonb_typeof(shared_look)<>'object' or octet_length(shared_look::text)>16000
       or shared_look - array['style','colour','background','params','design','response'] <> '{}'::jsonb
       or coalesce(shared_look->>'style','') not in ('bars','mirror','radial','wave','particles','aurora','orbit','rings','spiral','grid','starburst','tunnel','prism','city','notes')
       or coalesce(shared_look->>'colour','') !~ '^#[0-9a-fA-F]{6}$'
       or coalesce(shared_look->>'background','') !~ '^#[0-9a-fA-F]{6}$'
       or coalesce(jsonb_typeof(shared_look->'params'),'')<>'array'
       or coalesce(jsonb_typeof(shared_look->'design'),'')<>'object'
    then raise exception 'This look is invalid. Attach it again from Create.'; end if;
    -- Only colour design values; never image data, audio paths or MIDI bytes.
    if (shared_look->'design') - array['kind','angle','customColours','colours'] <> '{}'::jsonb then
      raise exception 'This look contains unsupported design data.';
    end if;
  end if;
  -- Serialize publishes for an account so simultaneous requests cannot bypass
  -- the short duplicate-click/spam guard.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(me::text,0));
  if exists(select 1 from public.community_posts where author_id=me and kind<>'joined' and created_at>now()-interval '10 seconds') then
    raise exception 'Give it a moment before posting again.';
  end if;
  insert into public.community_posts(author_id,kind,body,look)
    values(me,case when shared_look is null then 'text' else 'look' end,btrim(post_body),shared_look)
    returning id into post_id;
  return post_id;
end $$;

create or replace function public.community_feed(feed_scope text default 'everyone', before_created timestamptz default null, before_id uuid default null)
returns table(id uuid,kind text,body text,look jsonb,created_at timestamptz,username text,display_name text,is_own boolean)
language sql stable security definer set search_path='' as $$
  select p.id,p.kind,p.body,p.look,p.created_at,a.username,a.display_name,(p.author_id=auth.uid())
  from public.community_posts p join public.profiles a on a.id=p.author_id
  where auth.uid() is not null and feed_scope in ('everyone','friends')
    and (before_created is null or (p.created_at,p.id)<(before_created,before_id))
    and (feed_scope='everyone' or p.author_id=auth.uid() or exists(
      select 1 from public.friendships f where f.status='accepted'
        and ((f.sender_id=auth.uid() and f.recipient_id=p.author_id) or (f.recipient_id=auth.uid() and f.sender_id=p.author_id))))
  order by p.created_at desc,p.id desc limit 30;
$$;
create or replace function public.community_delete_post(post_id uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  delete from public.community_posts where id=post_id and author_id=auth.uid();
  if not found then raise exception 'This post is no longer available to delete.'; end if;
end $$;

revoke all on function public.community_create_profile(text,text,text,boolean) from public,anon;
revoke all on function public.community_publish_post(text,jsonb) from public,anon;
revoke all on function public.community_feed(text,timestamptz,uuid) from public,anon;
revoke all on function public.community_delete_post(uuid) from public,anon;
grant execute on function public.community_create_profile(text,text,text,boolean) to authenticated;
grant execute on function public.community_publish_post(text,jsonb) to authenticated;
grant execute on function public.community_feed(text,timestamptz,uuid) to authenticated;
grant execute on function public.community_delete_post(uuid) to authenticated;
commit;
