-- Gridquake 0.6: scores are 10 times bigger and a combo streak counts x2, x3, x4...
-- 1. Raise the plausibility limits of the score functions.
-- 2. Convert stored scores once (x10), so old and new records stay comparable.
--    Undo: divide the same columns by 10 and restore the old limits (3000/5000, 3000/20000, 500000).

CREATE OR REPLACE FUNCTION public.gq_submit_score(p_score integer, p_moves integer, p_duration_ms integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v uuid := gridquake.me(); v_last timestamptz; v_new boolean;
begin
  if p_score is null or p_moves is null or p_duration_ms is null or p_score < 0 or p_moves < 1
     or p_moves > 2000 or p_duration_ms < p_moves * 250 or p_duration_ms > 6 * 3600 * 1000
     or p_score > p_moves * 60000 + 50000 then
    return jsonb_build_object('status', 'rejected');
  end if;
  select max(created_at) into v_last from gridquake.scores where player_id = v;
  if v_last is not null and now() - v_last < interval '10 seconds' then return jsonb_build_object('status', 'rejected'); end if;
  insert into gridquake.scores (player_id, score, moves, duration_ms) values (v, p_score, p_moves, p_duration_ms);
  select p_score > best into v_new from gridquake.players where id = v;
  update gridquake.players set best = greatest(best, p_score), last_seen_at = now() where id = v;
  return jsonb_build_object('status', 'accepted', 'new_best', v_new, 'profile', gridquake.profile_json(v));
end $function$;

CREATE OR REPLACE FUNCTION public.gq_duel_submit(p_duel uuid, p_score integer, p_prog integer[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v uuid := gridquake.me(); d gridquake.duels%rowtype;
begin
  if p_score is null or p_score < 0 or p_score > 20 * 60000 + 200000 or p_prog is null or cardinality(p_prog) > 20 then
    return jsonb_build_object('status', 'rejected'); end if;
  select * into d from gridquake.duels where id = p_duel for update;
  if d.id is null or (d.from_id <> v and d.to_id is distinct from v) then return jsonb_build_object('status', 'unknown'); end if;
  if d.from_id = v then
    if d.from_score is not null then return jsonb_build_object('status', 'already'); end if;
    update gridquake.duels set from_score = p_score, from_prog = p_prog, from_at = now() where id = d.id returning * into d;
  else
    if d.to_score is not null then return jsonb_build_object('status', 'already'); end if;
    update gridquake.duels set to_score = p_score, to_prog = p_prog, to_at = now() where id = d.id returning * into d;
  end if;
  return jsonb_build_object('status', 'accepted', 'duel', gridquake.duel_json(d, v));
end $function$;

CREATE OR REPLACE FUNCTION public.gq_save_stars(p_level integer, p_stars integer, p_score integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v uuid := gridquake.me();
begin
  if p_level is null or p_level not between 1 and 200 or p_stars is null or p_stars not between 1 and 3
     or p_score is null or p_score < 0 or p_score > 10000000 then return jsonb_build_object('status', 'rejected'); end if;
  insert into gridquake.camp_stars (player_id, level, stars, best) values (v, p_level, p_stars, p_score)
    on conflict (player_id, level) do update set stars = greatest(gridquake.camp_stars.stars, excluded.stars),
      best = greatest(gridquake.camp_stars.best, excluded.best), updated_at = now();
  return jsonb_build_object('status', 'accepted');
end $function$;

update gridquake.players set best = best * 10 where best > 0;
update gridquake.scores set score = score * 10;
update gridquake.camp_stars set best = best * 10;
update gridquake.duels set
  from_score = from_score * 10, to_score = to_score * 10,
  from_prog = (select array_agg(x * 10 order by i) from unnest(from_prog) with ordinality t(x, i)),
  to_prog = (select array_agg(x * 10 order by i) from unnest(to_prog) with ordinality t(x, i));
