-- Gridquake 0.7: coins, helpers, daily wheel and rewarded-ad bonuses kept and checked on the server.
-- Everything lives in schema gridquake (rule: one schema per game). The app calls these functions with
-- the header Content-Profile: gridquake, so the schema must be listed under Exposed schemas (Data API).
--
-- Rules (all checked here, never in the app):
--   * Coins never go below 0; prices are fixed here.
--   * Daily wheel: one free spin per day; the day changes at midnight Europe/Brussels.
--     After the free spin, one extra spin per day can be earned with a rewarded video.
--   * Coin video: +100 coins, at most once every 30 minutes and 10 times per day.
--   * A video only counts when Google AdMob confirms it with a signed callback (Edge Function
--     gq-admob-ssv -> gridquake.record_ssv). For test builds (Google's test ads send no callback)
--     the setting 'unverified_ads' lets the app claim the reward itself, with the same limits.
--     Switch it off before the Play Store release:
--       update gridquake.settings set value = 'false' where key = 'unverified_ads';
--   * Coins for a level: 10 + 5 per star the first time (or the difference when the stars go up),
--     3 for a replay (at most once a minute); a gift box once after every 3rd level.
--     Coins for Classic: score / 1500, at most 30 per game.
-- Undo: drop the functions below and the tables wallets, ad_ssv and settings.

create table if not exists gridquake.settings (key text primary key, value jsonb not null);
insert into gridquake.settings (key, value) values ('unverified_ads', 'true') on conflict (key) do nothing;

create table if not exists gridquake.wallets (
  player_id uuid primary key references auth.users (id) on delete cascade,
  coins integer not null default 100 check (coins >= 0),
  items jsonb not null default '{"hamer":1,"draai":1,"dobbel":1}'::jsonb,
  wheel_day date,
  extra_day date,
  extra_spins integer not null default 0 check (extra_spins between 0 and 1),
  ad_day date,
  ad_views integer not null default 0,
  last_ad_at timestamptz,
  earned jsonb not null default '{}'::jsonb,
  chests jsonb not null default '{}'::jsonb,
  last_replay_at timestamptz,
  classic_game text,
  classic_paid integer not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists gridquake.ad_ssv (
  tx text primary key,
  player_id uuid not null,
  kind text not null,
  status text,
  created_at timestamptz not null default now()
);

alter table gridquake.settings enable row level security;
alter table gridquake.wallets enable row level security;
alter table gridquake.ad_ssv enable row level security;
revoke all on gridquake.settings, gridquake.wallets, gridquake.ad_ssv from public, anon, authenticated;

-- ---------- helpers (not callable from the app) ----------
create or replace function gridquake.brussels_day() returns date language sql stable set search_path = ''
as $$ select (now() at time zone 'Europe/Brussels')::date $$;

create or replace function gridquake.item_price(p_item text) returns integer language sql immutable set search_path = ''
as $$ select case p_item when 'hamer' then 60 when 'draai' then 40 when 'dobbel' then 50 when 'raket' then 80 when 'zetten' then 90 end $$;

create or replace function gridquake.ensure_wallet(v uuid) returns void language sql security definer set search_path = ''
as $$ insert into gridquake.wallets (player_id) values (v) on conflict (player_id) do nothing $$;

create or replace function gridquake.wallet_json(v uuid) returns jsonb language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'coins', w.coins,
    'items', w.items,
    'wheel_free', w.wheel_day is distinct from gridquake.brussels_day(),
    'extra', case when w.extra_day = gridquake.brussels_day() then w.extra_spins else 0 end,
    'extra_possible', w.extra_day is distinct from gridquake.brussels_day(),
    'ad_wait', greatest(0, ceil(extract(epoch from (w.last_ad_at + interval '30 minutes' - now()))))::integer,
    'ads_left', greatest(0, 10 - case when w.ad_day = gridquake.brussels_day() then w.ad_views else 0 end),
    'reset_in', ceil(extract(epoch from (((gridquake.brussels_day() + 1)::timestamp at time zone 'Europe/Brussels') - now())))::integer,
    'chests', w.chests)
  from gridquake.wallets w where w.player_id = v
$$;

-- one rewarded video for a player: 'coins' (+100) or 'spin' (one extra wheel spin today)
create or replace function gridquake.grant_ad(v uuid, p_kind text) returns text language plpgsql security definer set search_path = ''
as $$
declare w gridquake.wallets%rowtype; d date := gridquake.brussels_day();
begin
  perform gridquake.ensure_wallet(v);
  select * into w from gridquake.wallets where player_id = v for update;
  if p_kind = 'coins' then
    if w.ad_day = d and w.ad_views >= 10 then return 'limit'; end if;
    -- 29 minutes: a confirmation from Google can arrive a little later than the video ended
    if w.last_ad_at is not null and w.last_ad_at > now() - interval '29 minutes' then return 'cooldown'; end if;
    update gridquake.wallets set coins = coins + 100, last_ad_at = now(),
      ad_views = case when ad_day = d then ad_views + 1 else 1 end, ad_day = d, updated_at = now() where player_id = v;
    return 'granted';
  elsif p_kind = 'spin' then
    if w.wheel_day is distinct from d then return 'not_needed'; end if;
    if w.extra_day = d then return 'limit'; end if;
    update gridquake.wallets set extra_day = d, extra_spins = 1, updated_at = now() where player_id = v;
    return 'granted';
  end if;
  return 'unknown';
end $$;

-- ---------- called by the Edge Function after Google's signed callback (service role only) ----------
create or replace function gridquake.record_ssv(p_tx text, p_player uuid, p_kind text) returns jsonb language plpgsql security definer set search_path = ''
as $$
declare r text;
begin
  if p_tx is null or p_player is null or p_kind not in ('coins', 'spin') then return jsonb_build_object('status', 'ignored'); end if;
  if not exists (select 1 from auth.users where id = p_player) then return jsonb_build_object('status', 'unknown'); end if;
  insert into gridquake.ad_ssv (tx, player_id, kind) values (p_tx, p_player, p_kind) on conflict (tx) do nothing;
  if not found then return jsonb_build_object('status', 'duplicate'); end if;
  r := gridquake.grant_ad(p_player, p_kind);
  update gridquake.ad_ssv set status = r where tx = p_tx;
  return jsonb_build_object('status', r);
end $$;

-- ---------- called by the app ----------
create or replace function gridquake.wallet() returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v uuid := auth.uid();
begin
  if v is null then raise exception 'not signed in' using errcode = '28000'; end if;
  perform gridquake.ensure_wallet(v);
  return gridquake.wallet_json(v);
end $$;

-- test builds only (setting unverified_ads): the app claims the video reward itself, same limits
create or replace function gridquake.ad_claim(p_kind text) returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v uuid := auth.uid(); r text;
begin
  if v is null then raise exception 'not signed in' using errcode = '28000'; end if;
  if coalesce((select value = 'true'::jsonb from gridquake.settings where key = 'unverified_ads'), false) is not true then
    return jsonb_build_object('status', 'ssv', 'wallet', gridquake.wallet_json(v));
  end if;
  r := gridquake.grant_ad(v, p_kind);
  return jsonb_build_object('status', r, 'wallet', gridquake.wallet_json(v));
end $$;

create or replace function gridquake.buy(p_item text) returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v uuid := auth.uid(); price integer := gridquake.item_price(p_item); c integer;
begin
  if v is null then raise exception 'not signed in' using errcode = '28000'; end if;
  if price is null then return jsonb_build_object('status', 'unknown'); end if;
  perform gridquake.ensure_wallet(v);
  select coins into c from gridquake.wallets where player_id = v for update;
  if c < price then return jsonb_build_object('status', 'poor', 'wallet', gridquake.wallet_json(v)); end if;
  update gridquake.wallets set coins = coins - price,
    items = jsonb_set(items, array[p_item], to_jsonb(coalesce((items->>p_item)::integer, 0) + 1)), updated_at = now()
    where player_id = v;
  return jsonb_build_object('status', 'ok', 'wallet', gridquake.wallet_json(v));
end $$;

create or replace function gridquake.use_item(p_item text) returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v uuid := auth.uid(); n integer;
begin
  if v is null then raise exception 'not signed in' using errcode = '28000'; end if;
  if gridquake.item_price(p_item) is null then return jsonb_build_object('status', 'unknown'); end if;
  perform gridquake.ensure_wallet(v);
  select coalesce((items->>p_item)::integer, 0) into n from gridquake.wallets where player_id = v for update;
  if n < 1 then return jsonb_build_object('status', 'none', 'wallet', gridquake.wallet_json(v)); end if;
  update gridquake.wallets set items = jsonb_set(items, array[p_item], to_jsonb(n - 1)), updated_at = now() where player_id = v;
  return jsonb_build_object('status', 'used', 'wallet', gridquake.wallet_json(v));
end $$;

-- the wheel: the server picks the segment; same order as WHEEL in index.html
create or replace function gridquake.wheel_spin() returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v uuid := auth.uid(); d date := gridquake.brussels_day(); w gridquake.wallets%rowtype; seg integer; prize jsonb;
  segs jsonb := '[{"c":20},{"it":"hamer"},{"c":50},{"it":"draai"},{"c":10},{"it":"dobbel"},{"c":100},{"it":"zetten"},{"c":30},{"it":"raket"}]';
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

-- coins for a won level (and the gift box after every 3rd level, once)
create or replace function gridquake.earn_level(p_level integer, p_stars integer) returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v uuid := auth.uid(); w gridquake.wallets%rowtype; prev integer; gain integer := 0; chest jsonb := null; roll double precision; it text;
begin
  if v is null then raise exception 'not signed in' using errcode = '28000'; end if;
  if p_level is null or p_level not between 1 and 220 or p_stars is null or p_stars not between 1 and 3 then
    return jsonb_build_object('status', 'rejected'); end if;
  perform gridquake.ensure_wallet(v);
  select * into w from gridquake.wallets where player_id = v for update;
  prev := coalesce((w.earned->>p_level::text)::integer, 0);
  if p_stars > prev then
    gain := (10 + 5 * p_stars) - case when prev > 0 then 10 + 5 * prev else 0 end;
    update gridquake.wallets set earned = jsonb_set(earned, array[p_level::text], to_jsonb(p_stars)) where player_id = v;
  elsif w.last_replay_at is null or w.last_replay_at < now() - interval '1 minute' then
    gain := 3;
    update gridquake.wallets set last_replay_at = now() where player_id = v;
  end if;
  if p_level % 3 = 0 and not (w.chests ? p_level::text) then
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
  return jsonb_build_object('status', 'ok', 'gain', gain, 'chest', chest, 'wallet', gridquake.wallet_json(v));
end $$;

-- coins for a Classic game: score / 1500, at most 30 per game; a rescued game only pays the extra part
create or replace function gridquake.earn_classic(p_game text, p_score integer) returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v uuid := auth.uid(); w gridquake.wallets%rowtype; total integer; gain integer;
begin
  if v is null then raise exception 'not signed in' using errcode = '28000'; end if;
  if p_game is null or length(p_game) > 40 or p_score is null or p_score < 0 or p_score > 5000000 then
    return jsonb_build_object('status', 'rejected'); end if;
  perform gridquake.ensure_wallet(v);
  select * into w from gridquake.wallets where player_id = v for update;
  total := least(30, p_score / 1500);
  gain := greatest(0, total - case when w.classic_game = p_game then w.classic_paid else 0 end);
  update gridquake.wallets set coins = coins + gain, classic_game = p_game,
    classic_paid = case when w.classic_game = p_game then greatest(w.classic_paid, total) else total end, updated_at = now()
    where player_id = v;
  return jsonb_build_object('status', 'ok', 'gain', gain, 'wallet', gridquake.wallet_json(v));
end $$;

-- ---------- rights: the app may only call these functions ----------
grant usage on schema gridquake to anon, authenticated, service_role;
revoke execute on all functions in schema gridquake from public, anon, authenticated;
grant execute on function gridquake.wallet(), gridquake.ad_claim(text), gridquake.buy(text), gridquake.use_item(text),
  gridquake.wheel_spin(), gridquake.earn_level(integer, integer), gridquake.earn_classic(text, integer) to authenticated;
grant execute on function gridquake.record_ssv(text, uuid, text) to service_role;
