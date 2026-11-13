-- Gridquake 0.7: close the coin loopholes found in the review of pull request 1.
--   * Classic: a new game pays at most once a minute and at most 300 coins a day; a rescued game
--     (same game id) still pays only its extra part. Before, every new game id paid again at once.
--   * Levels: a first win (or more stars) pays at most once every 20 seconds and for at most
--     40 levels a day; the gift box comes only with a paid first win. A claim over the limit pays
--     nothing and is not recorded, so it can still be paid later. Before, all 220 levels could be
--     claimed at once without playing.
--   * Video rewards without Google's confirmation (test builds) are only accepted until the date in
--     setting 'unverified_until' (21 days from now). After that, or once it is set to null, only
--     confirmed videos (SSV) pay. To end it now:
--       update gridquake.settings set value = 'null' where key = 'unverified_until';
-- Undo: restore earn_level, earn_classic and ad_claim from gq09 and the setting 'unverified_ads'.

alter table gridquake.wallets
  add column if not exists level_at timestamptz,
  add column if not exists level_day date,
  add column if not exists level_claims integer not null default 0,
  add column if not exists classic_at timestamptz,
  add column if not exists classic_day date,
  add column if not exists classic_coins integer not null default 0;

delete from gridquake.settings where key = 'unverified_ads';
insert into gridquake.settings (key, value) values ('unverified_until', to_jsonb(now() + interval '21 days'))
  on conflict (key) do update set value = excluded.value;

create or replace function gridquake.ad_claim(p_kind text) returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v uuid := auth.uid(); r text; until timestamptz;
begin
  if v is null then raise exception 'not signed in' using errcode = '28000'; end if;
  select case when jsonb_typeof(value) = 'string' then (value #>> '{}')::timestamptz end into until
    from gridquake.settings where key = 'unverified_until';
  if until is null or now() >= until then
    return jsonb_build_object('status', 'ssv', 'wallet', gridquake.wallet_json(v));
  end if;
  r := gridquake.grant_ad(v, p_kind);
  return jsonb_build_object('status', r, 'wallet', gridquake.wallet_json(v));
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
    -- a real level takes longer than 20 seconds, and nobody wins more than 40 new levels a day
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
  -- the gift box after every 3rd level comes only with a paid first win
  if paid and p_level % 3 = 0 and not (w.chests ? p_level::text) then
    roll := random();
    if roll < 0.55 then chest := jsonb_build_object('c', 30 + floor(random() * 4)::integer * 10);
      gain := gain + (chest->>'c')::integer;
    else it := (array['hamer','draai','dobbel','raket','zetten'])[1 + floor(random() * 5)::integer];
      chest := jsonb_build_object('it', it);
      update gridquake.wallets set items = jsonb_set(items, array[it], to_jsonb(coalesce((items->>it)::integer, 0) + 1)) where player_id = v;
    end if;
    update gridquake.wallets set chests = jsonb_set(chests, array[p_level::text], 'true'::jsonb) where player_id = v;
  end if;
  update gridquake.wallets set coins = coins + gain, updated_at = now() where player_id = v;
  return jsonb_build_object('status', st, 'gain', gain, 'chest', chest, 'wallet', gridquake.wallet_json(v));
end $$;

create or replace function gridquake.earn_classic(p_game text, p_score integer) returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v uuid := auth.uid(); w gridquake.wallets%rowtype; d date := gridquake.brussels_day(); total integer; gain integer; same boolean;
  today_coins integer;
begin
  if v is null then raise exception 'not signed in' using errcode = '28000'; end if;
  if p_game is null or length(p_game) > 40 or p_score is null or p_score < 0 or p_score > 5000000 then
    return jsonb_build_object('status', 'rejected'); end if;
  perform gridquake.ensure_wallet(v);
  select * into w from gridquake.wallets where player_id = v for update;
  same := w.classic_game = p_game;
  -- a new game pays at most once a minute (a real game takes longer)
  if not same and w.classic_at is not null and w.classic_at > now() - interval '1 minute' then
    return jsonb_build_object('status', 'limit', 'gain', 0, 'wallet', gridquake.wallet_json(v));
  end if;
  total := least(30, p_score / 1500);
  gain := greatest(0, total - case when same then w.classic_paid else 0 end);
  -- at most 300 coins a day from Classic
  today_coins := case when w.classic_day = d then w.classic_coins else 0 end;
  gain := least(gain, greatest(0, 300 - today_coins));
  update gridquake.wallets set coins = coins + gain, classic_game = p_game,
    classic_paid = case when same then greatest(w.classic_paid, total) else total end,
    classic_at = case when same then w.classic_at else now() end,
    classic_coins = today_coins + gain, classic_day = d, updated_at = now()
    where player_id = v;
  return jsonb_build_object('status', 'ok', 'gain', gain, 'wallet', gridquake.wallet_json(v));
end $$;

revoke execute on all functions in schema gridquake from public, anon, authenticated;
grant execute on function gridquake.wallet(), gridquake.ad_claim(text), gridquake.buy(text), gridquake.use_item(text),
  gridquake.wheel_spin(), gridquake.earn_level(integer, integer), gridquake.earn_classic(text, integer) to authenticated;
grant execute on function gridquake.record_ssv(text, uuid, text) to service_role;
