-- Gridquake 0.7: friends on the campaign map.
-- gq_friends also returns 'lvl': the furthest campaign level a friend has won (0 = none yet).
-- Additive only: older app versions ignore the new field.
-- Undo: restore the previous body (without 'lvl').

CREATE OR REPLACE FUNCTION public.gq_friends()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'nickname', p.nickname, 'best', p.best,
    'medals', gridquake.medal_count(p.medals),
    'lvl', coalesce((select max(c.level) from gridquake.camp_stars c where c.player_id = p.id and c.stars > 0), 0))
    order by p.nickname), '[]'::jsonb)
  from gridquake.friendships f join gridquake.players p on p.id = f.friend_id
  where f.player_id = gridquake.me();
$function$;
