-- Gridquake: deleting your account also removes the anonymous login (auth.users),
-- the same way Seed & Destroy does. All Gridquake data goes with it (ON DELETE CASCADE).
-- Safety: the login is only removed when it is not also a Seed & Destroy player
-- (both games share one Supabase project); in that case only the Gridquake data goes.
-- Undo: restore the previous body (delete from gridquake.players only).

CREATE OR REPLACE FUNCTION public.gq_delete_me()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v uuid := auth.uid();
begin
  if v is null then raise exception 'not signed in' using errcode = '28000'; end if;
  delete from gridquake.players where id = v;
  if not exists (select 1 from public.players where id = v) then
    delete from auth.users where id = v;
  end if;
  return jsonb_build_object('status', 'deleted');
end $function$;
