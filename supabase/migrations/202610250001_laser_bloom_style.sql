-- Allow the new style in shared looks; preserve all existing permissions,
-- private-data checks, rate limits and template-name validation.
begin;
do $$
declare source text;
begin
  source := pg_get_functiondef('public.community_publish_post(text,jsonb)'::regprocedure);
  if position('''laser''' in source)=0 then
    if position('''prism'',''city'',''notes''' in source)=0 then
      raise exception 'The feed style list has changed. Review this migration before applying.';
    end if;
    source := replace(source,'''prism'',''city'',''notes''','''prism'',''city'',''notes'',''laser''');
    execute source;
  end if;
end $$;
commit;
