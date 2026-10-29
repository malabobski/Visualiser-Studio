-- Extend the feed's style allowlist while retaining its existing validation.
begin;
do $$
declare source text; style text;
begin
  source := pg_get_functiondef('public.community_publish_post(text,jsonb)'::regprocedure);
  foreach style in array array['wings','glass'] loop
    if position(quote_literal(style) in source)=0 then
      if position('''notes''' in source)=0 then
        raise exception 'The feed style list has changed. Review this migration before applying.';
      end if;
      source := replace(source,'''notes''','''notes'',' || quote_literal(style));
    end if;
  end loop;
  execute source;
end $$;
commit;
