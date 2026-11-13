-- Gridquake 0.7: the helper "+3 zetten" becomes the heart ("hart"): continue a game that is over or a lost level.
--   * Shop item 'hart' (90 coins) replaces 'zetten'; hearts players already have as 'zetten' are converted.
--   * The daily wheel and the gift boxes give a heart instead of +3 moves (same segment, same chance).
-- Undo: swap 'hart' back to 'zetten' in item_price, wheel_spin and earn_level, and convert the items back.

create or replace function gridquake.item_price(p_item text) returns integer language sql immutable set search_path = ''
as $$ select case p_item when 'hamer' then 60 when 'draai' then 40 when 'dobbel' then 50 when 'raket' then 80 when 'hart' then 90 end $$;

update gridquake.wallets
  set items = (items - 'zetten') || jsonb_build_object('hart', coalesce((items->>'hart')::integer, 0) + coalesce((items->>'zetten')::integer, 0))
  where items ? 'zetten';

create or replace function gridquake.wheel_spin() returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v uuid := auth.uid(); d date := gridquake.brussels_day(); w gridquake.wallets%rowtype; seg integer; prize jsonb;
  segs jsonb := '[{"c":20},{"it":"hamer"},{"c":50},{"it":"draai"},{"c":10},{"it":"dobbel"},{"c":100},{"it":"hart"},{"c":30},{"it":"raket"}]';
begin
  if v is null then raise exception 'not signed in' using errcode = '28000'; end if;
  perform gridquake.ensure_wallet(v);
  select * into w from gridquake.wallets where player_id = v for update;
  if w.wheel_day is distinct from d then update gridquake.wallets set wheel_day = d where player_id = v;
  elsif w.extra_day = d and w.extra_spins > 0 then update gridquake.wallets set extra_spins = 0 where player_id = v;
  else return jsonb_build_object('status', 'cooldown', 'wallet', gridquake.wallet_json(v)); end if;
  seg := floor(random() * jsonb_array_length(segs))::integer;
  prize := segs->seg;
  if prize ? 'c' then update gridquake.wallets set coins = coins + (prize->>'c')::integer, updated_at = now() where player_id = v;
  else update gridquake.wallets set items = jsonb_set(items, array[prize->>'it'], to_jsonb(coalesce((items->>(prize->>'it'))::integer, 0) + 1)), updated_at = now() where player_id = v;
  end if;
  return jsonb_build_object('status', 'ok', 'seg', seg, 'prize', prize, 'wallet', gridquake.wallet_json(v));
end $$;

create or replace function gridquake.earn_level(p_level integer, p_stars integer) returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v uuid := auth.uid(); w gridquake.wallets%rowtype; d date := gridquake.brussels_day(); prev integer; gain integer := 0;
  chest jsonb := null; roll double precision; it text; paid boolean := false; st text := 'ok';
begin
  if v is null then raise exception 'not signed in' using errcode = '28000'; end if;
  if p_level is null or p_level not between 1 and 220 or p_stars is null or p_stars not between 1 and 3 then
    return jsonb_build_object('status', 'rejected'); end if;
  perform gridquake.ensure_wallet(v);
  select * into w from gridquake.wallets where player_id = v for update;
  prev := coalesce((w.earned->>p_level::text)::integer, 0);
  if p_stars > prev then
    if (w.level_at is not null and w.level_at > now() - interval '20 seconds')
       or (w.level_day = d and w.level_claims >= 40) then
      st := 'limit';
    else
      gain := (10 + 5 * p_stars) - case when prev > 0 then 10 + 5 * prev else 0 end;
      paid := prev = 0;
      update gridquake.wallets set earned = jsonb_set(earned, array[p_level::text], to_jsonb(p_stars)), level_at = now(),
        level_claims = case when level_day = d then level_claims + 1 else 1 end, level_day = d where player_id = v;
    end if;
  elsif w.last_replay_at is null or w.last_replay_at < now() - interval '1 minute' then
    gain := 3;
    update gridquake.wallets set last_replay_at = now() where player_id = v;
  end if;
  if paid and p_level % 3 = 0 and not (w.chests ? p_level::text) then
    roll := random();
    if roll < 0.55 then chest := jsonb_build_object('c', 30 + floor(random() * 4)::integer * 10);
      gain := gain + (chest->>'c')::integer;
    else it := (array['hamer','draai','dobbel','raket','hart'])[1 + floor(random() * 5)::integer];
      chest := jsonb_build_object('it', it);
      update gridquake.wallets set items = jsonb_set(items, array[it], to_jsonb(coalesce((items->>it)::integer, 0) + 1)) where player_id = v;
    end if;
    update gridquake.wallets set chests = jsonb_set(chests, array[p_level::text], 'true'::jsonb) where player_id = v;
  end if;
  update gridquake.wallets set coins = coins + gain, updated_at = now() where player_id = v;
  return jsonb_build_object('status', st, 'gain', gain, 'chest', chest, 'wallet', gridquake.wallet_json(v));
end $$;

revoke execute on all functions in schema gridquake from public, anon, authenticated;
grant execute on function gridquake.wallet(), gridquake.ad_claim(text), gridquake.buy(text), gridquake.use_item(text),
  gridquake.wheel_spin(), gridquake.earn_level(integer, integer), gridquake.earn_classic(text, integer) to authenticated;
grant execute on function gridquake.record_ssv(text, uuid, text) to service_role;
