-- Run after the profiles and friends migrations. Safe to run again.
begin;
alter table public.profiles add column if not exists username_changed_at timestamptz;

-- Existing profiles can make their first change immediately. The first choice
-- at signup doesn't start a cooldown; subsequent changes do, for a calendar month.
create or replace function public.community_guard_username()
returns trigger language plpgsql set search_path = '' set timezone = 'UTC' as $$
begin
  if TG_OP = 'INSERT' then
    new.username_changed_at := null;
  elsif new.username is distinct from old.username then
    if old.username_changed_at is not null and now() < old.username_changed_at + interval '1 month' then
      raise exception 'You can change your username again on %.',
        to_char(old.username_changed_at + interval '1 month', 'DD Mon YYYY at HH24:MI UTC');
    end if;
    new.username_changed_at := now();
  else
    new.username_changed_at := old.username_changed_at;
  end if;
  return new;
end $$;
revoke all on function public.community_guard_username() from public, anon, authenticated;
drop trigger if exists community_username_cooldown on public.profiles;
create trigger community_username_cooldown before insert or update on public.profiles
  for each row execute function public.community_guard_username();

-- Only the current account's next change date goes to the interface.
create or replace function public.community_username_status()
returns timestamptz language sql stable security definer set search_path = '' set timezone = 'UTC' as $$
  select username_changed_at + interval '1 month' from public.profiles where id = auth.uid();
$$;
revoke all on function public.community_username_status() from public, anon;
grant execute on function public.community_username_status() to authenticated;

create or replace function public.community_search_people(search_term text)
returns table (id uuid, username text, display_name text, bio text)
language plpgsql stable security definer set search_path = '' as $$
declare term text := lower(ltrim(btrim(search_term), '@'));
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  if term is null or term !~ '^[a-z0-9_]{3,24}$' then return; end if;
  return query select p.id, p.username, p.display_name, p.bio
    from public.profiles p where left(p.username, length(term)) = term
    order by (p.username = term) desc, p.username limit 12;
end $$;
commit;
