-- Gridquake: campaign of 10 maps x 20 levels (decision 14), old stars reset (decision 16), map medals (decision 17).
delete from gridquake.camp_stars;
alter table gridquake.camp_stars drop constraint camp_stars_level_check;
alter table gridquake.camp_stars add constraint camp_stars_level_check check (level between 1 and 200);

-- medals per map: {"1":"bsg", ...} b = bronze, s = silver, g = gold
alter table gridquake.players add column medals jsonb not null default '{}'::jsonb;

create or replace function gridquake.medal_count(m jsonb) returns integer language sql immutable as $$
  select coalesce(sum(length(value)), 0)::int from jsonb_each_text(coalesce(m, '{}'::jsonb));
$$;

create or replace function gridquake.profile_json(p_id uuid) returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('nickname', p.nickname, 'lang', p.lang, 'friend_code', p.friend_code, 'best', p.best,
    'week_best', coalesce((select max(s.score) from gridquake.scores s where s.player_id = p.id
        and s.created_at >= date_trunc('week', now() at time zone 'Europe/Brussels') at time zone 'Europe/Brussels'), 0),
    'camp', coalesce((select jsonb_object_agg(c.level::text, c.stars) from gridquake.camp_stars c where c.player_id = p.id), '{}'::jsonb),
    'medals', p.medals)
  from gridquake.players p where p.id = p_id;
$$;

create or replace function public.gq_save_stars(p_level integer, p_stars integer, p_score integer) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v uuid := gridquake.me();
begin
  if p_level is null or p_level not between 1 and 200 or p_stars is null or p_stars not between 1 and 3
     or p_score is null or p_score < 0 or p_score > 500000 then return jsonb_build_object('status', 'rejected'); end if;
  insert into gridquake.camp_stars (player_id, level, stars, best) values (v, p_level, p_stars, p_score)
    on conflict (player_id, level) do update set stars = greatest(gridquake.camp_stars.stars, excluded.stars),
      best = greatest(gridquake.camp_stars.best, excluded.best), updated_at = now();
  return jsonb_build_object('status', 'accepted');
end $$;

-- Adds medals (never removes): keys '1'..'10', values made of the letters b, s, g.
create or replace function public.gq_save_medals(p_medals jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v uuid := gridquake.me(); cur jsonb; k text; val text; merged text; out jsonb;
begin
  if p_medals is null or jsonb_typeof(p_medals) <> 'object' then return jsonb_build_object('status', 'rejected'); end if;
  select medals into cur from gridquake.players where id = v for update;
  out := cur;
  for k, val in select * from jsonb_each_text(p_medals) loop
    if k !~ '^(10|[1-9])$' or val !~ '^[bsg]{0,3}$' then return jsonb_build_object('status', 'rejected'); end if;
    merged := '';
    if position('b' in coalesce(out->>k, '') || val) > 0 then merged := merged || 'b'; end if;
    if position('s' in coalesce(out->>k, '') || val) > 0 then merged := merged || 's'; end if;
    if position('g' in coalesce(out->>k, '') || val) > 0 then merged := merged || 'g'; end if;
    if merged <> '' then out := out || jsonb_build_object(k, merged); end if;
  end loop;
  update gridquake.players set medals = out where id = v;
  return jsonb_build_object('status', 'accepted', 'medals', out);
end $$;

create or replace function public.gq_friends() returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'nickname', p.nickname, 'best', p.best,
    'medals', gridquake.medal_count(p.medals)) order by p.nickname), '[]'::jsonb)
  from gridquake.friendships f join gridquake.players p on p.id = f.friend_id
  where f.player_id = gridquake.me();
$$;

revoke all on function public.gq_save_medals(jsonb) from public, anon;
grant execute on function public.gq_save_medals(jsonb) to authenticated;
revoke all on function gridquake.medal_count(jsonb) from public, anon, authenticated;
