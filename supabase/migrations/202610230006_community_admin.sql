-- Schema only. community-admin-setup.sql binds the owner once by account UUID.
begin;
create table if not exists public.community_owner(singleton boolean primary key default true check(singleton),user_id uuid not null unique);
create table if not exists public.community_verifications(user_id uuid primary key references public.profiles(id) on delete cascade,verified boolean not null default false);
create table if not exists public.community_notifications(
 id uuid primary key default gen_random_uuid(),recipient_id uuid not null references public.profiles(id) on delete cascade,
 title text not null check(char_length(btrim(title)) between 1 and 80),body text not null check(char_length(btrim(body)) between 1 and 500),created_at timestamptz not null default now()
);
create index if not exists community_notifications_recipient on public.community_notifications(recipient_id,created_at,id);
alter table public.community_owner enable row level security;
alter table public.community_verifications enable row level security;
alter table public.community_notifications enable row level security;
revoke all on public.community_owner,public.community_verifications,public.community_notifications from public,anon,authenticated;
alter table public.community_posts add column if not exists pinned boolean not null default false;
alter table public.community_posts add column if not exists announcement boolean not null default false;
alter table public.community_posts add column if not exists edited_at timestamptz;
create index if not exists community_posts_pins on public.community_posts(pinned,created_at desc,id desc);

create or replace function public.community_admin_status() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.community_owner where user_id=auth.uid());
$$;
create or replace function public.community_badges(usernames text[])
returns table(username text,verified boolean,is_admin boolean) language sql stable security definer set search_path='' as $$
 select p.username,coalesce(v.verified,false),exists(select 1 from public.community_owner a where a.user_id=p.id)
 from public.profiles p left join public.community_verifications v on v.user_id=p.id
 where auth.uid() is not null and p.username=any(usernames[1:100]);
$$;
create or replace function public.community_admin_pin(post_id uuid,pin boolean)
returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.community_admin_status() then raise exception 'Admin access required.'; end if;
 perform pg_catalog.pg_advisory_xact_lock(746592801);
 if pin and not exists(select 1 from public.community_posts where id=post_id and pinned)
   and (select count(*) from public.community_posts where pinned)>=5 then raise exception 'Unpin a post first. You can pin up to five posts.'; end if;
 update public.community_posts set pinned=pin where id=post_id;
 if not found then raise exception 'This post is no longer available.'; end if;
end $$;
create or replace function public.community_admin_announce(message_body text)
returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid;
begin
 if not public.community_admin_status() then raise exception 'Admin access required.'; end if;
 if message_body is null or char_length(btrim(message_body)) not between 1 and 1000 then raise exception 'Write an announcement of up to 1,000 characters.'; end if;
 insert into public.community_posts(author_id,kind,body,announcement) values(auth.uid(),'text',btrim(message_body),true) returning id into result;
 return result;
end $$;
create or replace function public.community_admin_edit(post_id uuid,message_body text,template_name text default null)
returns void language plpgsql security definer set search_path='' as $$
declare item public.community_posts;
begin
 if not public.community_admin_status() then raise exception 'Admin access required.'; end if;
 select * into item from public.community_posts where id=post_id for update;
 if not found then raise exception 'This post is no longer available.'; end if;
 if message_body is null or char_length(message_body)>1000 or(item.look is null and btrim(message_body)='') then raise exception 'Write a post of up to 1,000 characters.'; end if;
 if template_name is not null and (item.look is null or char_length(btrim(template_name)) not between 1 and 120) then raise exception 'Choose a template name of up to 120 characters.'; end if;
 update public.community_posts set body=btrim(message_body),kind=case when item.kind='joined' then 'text' else item.kind end,
 look=case when template_name is null then item.look else jsonb_set(item.look,'{template_name}',to_jsonb(btrim(template_name))) end,edited_at=now() where id=post_id;
end $$;
create or replace function public.community_admin_verify(target_username text,verify boolean)
returns void language plpgsql security definer set search_path='' as $$
declare target uuid;
begin
 if not public.community_admin_status() then raise exception 'Admin access required.'; end if;
 select id into target from public.profiles where username=lower(ltrim(btrim(target_username),'@'));
 if target is null then raise exception 'That profile could not be found.'; end if;
 insert into public.community_verifications values(target,verify) on conflict(user_id) do update set verified=excluded.verified;
end $$;
create or replace function public.community_admin_notify(target_username text,notification_title text,message_body text)
returns void language plpgsql security definer set search_path='' as $$
declare target uuid;
begin
 if not public.community_admin_status() then raise exception 'Admin access required.'; end if;
 if notification_title is null or char_length(btrim(notification_title)) not between 1 and 80
   or message_body is null or char_length(btrim(message_body)) not between 1 and 500 then raise exception 'Add a title (up to 80 characters) and message (up to 500).'; end if;
 select id into target from public.profiles where username=lower(ltrim(btrim(target_username),'@'));
 if target is null then raise exception 'That profile could not be found.'; end if;
 insert into public.community_notifications(recipient_id,title,body) values(target,btrim(notification_title),btrim(message_body));
end $$;
create or replace function public.community_notifications()
returns table(id uuid,title text,body text,created_at timestamptz) language sql stable security definer set search_path='' as $$
 select n.id,n.title,n.body,n.created_at from public.community_notifications n where n.recipient_id=auth.uid() and n.created_at>now()-interval '30 days'
 order by n.created_at,n.id limit 30;
$$;
create or replace function public.community_ack_notifications(notification_ids uuid[])
returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Sign in first.'; end if;
 if coalesce(cardinality(notification_ids),0)>30 then raise exception 'Too many notifications.'; end if;
 delete from public.community_notifications where recipient_id=auth.uid() and id=any(notification_ids);
end $$;
create or replace function public.community_delete_post(post_id uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Sign in first.'; end if;
 delete from public.community_posts where id=post_id and(author_id=auth.uid() or public.community_admin_status());
 if not found then raise exception 'This post is no longer available to delete.'; end if;
end $$;
-- Existing clients retain the old feed API; upgraded clients also receive role/moderation fields.
create or replace function public.community_feed_v2(feed_scope text default 'everyone',before_created timestamptz default null,before_id uuid default null)
returns table(id uuid,kind text,body text,look jsonb,created_at timestamptz,username text,display_name text,is_own boolean,pinned boolean,announcement boolean,edited_at timestamptz,verified boolean,is_admin boolean)
language sql stable security definer set search_path='' as $$
 select p.id,p.kind,p.body,p.look,p.created_at,a.username,a.display_name,p.author_id=auth.uid(),p.pinned,p.announcement,p.edited_at,
 coalesce(v.verified,false),exists(select 1 from public.community_owner o where o.user_id=a.id)
 from public.community_posts p join public.profiles a on a.id=p.author_id left join public.community_verifications v on v.user_id=a.id
 where auth.uid() is not null and feed_scope in('everyone','friends')
 and(before_created is null or(not p.pinned and (p.created_at,p.id)<(before_created,before_id)))
 and(feed_scope='everyone' or p.pinned or p.announcement or p.author_id=auth.uid() or exists(select 1 from public.friendships f where f.status='accepted'
 and((f.sender_id=auth.uid() and f.recipient_id=p.author_id)or(f.recipient_id=auth.uid() and f.sender_id=p.author_id))))
 order by p.pinned desc,p.created_at desc,p.id desc limit 30;
$$;
create or replace function public.community_expire_messages()
returns void language sql security definer set search_path='' as $$
 delete from public.community_messages where expires_at<=now();
 delete from public.community_dm_receipts where created_at<now()-interval '30 days';
 delete from public.community_notifications where created_at<=now()-interval '30 days';
$$;
do $$ declare signature text; begin
 foreach signature in array array['community_admin_status()','community_badges(text[])','community_admin_pin(uuid,boolean)',
 'community_admin_announce(text)','community_admin_edit(uuid,text,text)','community_admin_verify(text,boolean)','community_admin_notify(text,text,text)',
 'community_notifications()','community_ack_notifications(uuid[])','community_feed_v2(text,timestamptz,uuid)'] loop
 execute 'revoke all on function public.'||signature||' from public,anon';
 execute 'grant execute on function public.'||signature||' to authenticated';
 end loop;
end $$;
commit;
