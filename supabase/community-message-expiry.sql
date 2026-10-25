-- Run once in Supabase SQL Editor after migration 005.
-- Supabase Cron performs expiry even while every client is closed.
create extension if not exists pg_cron;
select cron.schedule('community-dm-expiry','17 * * * *','select public.community_expire_messages();');
