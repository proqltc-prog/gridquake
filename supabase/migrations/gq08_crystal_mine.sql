-- Gridquake 0.7: map 10 "Kristalmijn" (crystal mine) is added before the master test, which becomes map 11.
-- 1. The campaign now has 220 levels and 11 maps: widen the limits of the save functions.
-- 2. Move stored progress of the master test (levels 181-200, medals of map 10) one map further.
--    At the time of this migration nobody had progress there; the moves keep it correct anyway.
-- Undo: move levels 201-220 back by 20 and medals '11' back to '10', then restore the limits (200, map 10).

alter table gridquake.camp_stars drop constraint if exists camp_stars_level_check;
update gridquake.camp_stars set level = level + 20 where level between 181 and 200;
alter table gridquake.camp_stars add constraint camp_stars_level_check check (level between 1 and 220);

update gridquake.players set medals = (medals - '10') || jsonb_build_object('11', medals->>'10')
  where medals ? '10';

CREATE OR REPLACE FUNCTION public.gq_save_stars(p_level integer, p_stars integer, p_score integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v uuid := gridquake.me();
begin
  if p_level is null or p_level not between 1 and 220 or p_stars is null or p_stars not between 1 and 3
     or p_score is null or p_score < 0 or p_score > 500000 then return jsonb_build_object('status', 'rejected'); end if;
  insert into gridquake.camp_stars (player_id, level, stars, best) values (v, p_level, p_stars, p_score)
    on conflict (player_id, level) do update set stars = greatest(gridquake.camp_stars.stars, excluded.stars),
      best = greatest(gridquake.camp_stars.best, excluded.best), updated_at = now();
  return jsonb_build_object('status', 'accepted');
end $function$;

CREATE OR REPLACE FUNCTION public.gq_save_medals(p_medals jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v uuid := gridquake.me(); cur jsonb; k text; val text; merged text; out jsonb;
begin
  if p_medals is null or jsonb_typeof(p_medals) <> 'object' then return jsonb_build_object('status', 'rejected'); end if;
  select medals into cur from gridquake.players where id = v for update;
  out := cur;
  for k, val in select * from jsonb_each_text(p_medals) loop
    if k !~ '^(1[01]|[1-9])$' or val !~ '^[bsg]{0,3}$' then return jsonb_build_object('status', 'rejected'); end if;
    merged := '';
    if position('b' in coalesce(out->>k, '') || val) > 0 then merged := merged || 'b'; end if;
    if position('s' in coalesce(out->>k, '') || val) > 0 then merged := merged || 's'; end if;
    if position('g' in coalesce(out->>k, '') || val) > 0 then merged := merged || 'g'; end if;
    if merged <> '' then out := out || jsonb_build_object(k, merged); end if;
  end loop;
  update gridquake.players set medals = out where id = v;
  return jsonb_build_object('status', 'accepted', 'medals', out);
end $function$;
