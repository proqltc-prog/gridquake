-- Gridquake 0.7: a duel lasts 3 minutes instead of 20 moves.
-- Duels get a kind: 'm20' (20 moves, older app versions) or 't180' (3 minutes). The two kinds never meet:
-- the new functions below only make and play 't180' duels, the older public.gq_duel_* functions only 'm20'.
-- The progress (prog) of a 3-minute duel is the score after every second (at most 181 values), so the
-- opponent bar can follow the other player over time.

alter table gridquake.duels add column if not exists kind text not null default 'm20';
alter table gridquake.duels drop constraint if exists duels_kind_check;
alter table gridquake.duels add constraint duels_kind_check check (kind in ('m20', 't180'));
create index if not exists duels_open_kind on gridquake.duels (kind, created_at) where status = 'open';

create or replace function gridquake.duel_json(d gridquake.duels, v uuid) returns jsonb
language sql stable security definer set search_path to '' as $$
  select jsonb_build_object('id', d.id, 'seed', d.seed, 'mode', d.mode, 'kind', d.kind, 'status', d.status, 'created_at', d.created_at,
    'mine', d.from_id = v,
    'opponent', case when d.from_id = v then (select nickname from gridquake.players where id = d.to_id)
                     else (select nickname from gridquake.players where id = d.from_id) end,
    'opponent_id', case when d.from_id = v then d.to_id else d.from_id end,
    'my_score', case when d.from_id = v then d.from_score else d.to_score end,
    'their_score', case when d.from_id = v then d.to_score else d.from_score end,
    'their_prog', case when d.from_id = v then d.to_prog else d.from_prog end);
$$;

-- a random opponent: the oldest open 3-minute duel someone already played, or a new one
create or replace function gridquake.duel_random() returns jsonb
language plpgsql security definer set search_path to '' as $$
declare v uuid := gridquake.me(); d gridquake.duels%rowtype;
begin
  select * into d from gridquake.duels
    where status = 'open' and kind = 't180' and from_id <> v and from_score is not null and created_at > now() - interval '14 days'
    order by created_at limit 1 for update skip locked;
  if d.id is not null then
    update gridquake.duels set status = 'matched', to_id = v where id = d.id returning * into d;
  else
    insert into gridquake.duels (mode, kind, from_id) values ('random', 't180', v) returning * into d;
  end if;
  return gridquake.duel_json(d, v);
end $$;

-- challenge a friend to a 3-minute duel
create or replace function gridquake.duel_challenge(p_friend uuid) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare v uuid := gridquake.me(); d gridquake.duels%rowtype;
begin
  if not exists (select 1 from gridquake.friendships where player_id = v and friend_id = p_friend) then
    return jsonb_build_object('status', 'not_friends'); end if;
  insert into gridquake.duels (mode, kind, status, from_id, to_id) values ('friend', 't180', 'matched', v, p_friend) returning * into d;
  return gridquake.duel_json(d, v);
end $$;

-- the final score of a 3-minute duel; at most 120 moves of 3000 points plus 20000 for the biggest clears
create or replace function gridquake.duel_submit(p_duel uuid, p_score integer, p_prog integer[]) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare v uuid := gridquake.me(); d gridquake.duels%rowtype;
begin
  if p_score is null or p_score < 0 or p_score > 120 * 3000 + 20000 or p_prog is null or cardinality(p_prog) > 181 then
    return jsonb_build_object('status', 'rejected'); end if;
  select * into d from gridquake.duels where id = p_duel for update;
  if d.id is null or (d.from_id <> v and d.to_id is distinct from v) then return jsonb_build_object('status', 'unknown'); end if;
  if d.kind <> 't180' then return jsonb_build_object('status', 'wrong_kind'); end if;
  if d.from_id = v then
    if d.from_score is not null then return jsonb_build_object('status', 'already'); end if;
    update gridquake.duels set from_score = p_score, from_prog = p_prog, from_at = now() where id = d.id returning * into d;
  else
    if d.to_score is not null then return jsonb_build_object('status', 'already'); end if;
    update gridquake.duels set to_score = p_score, to_prog = p_prog, to_at = now() where id = d.id returning * into d;
  end if;
  return jsonb_build_object('status', 'accepted', 'duel', gridquake.duel_json(d, v));
end $$;

-- older app versions keep their 20-move duels and can never pick up or submit a 3-minute one
create or replace function public.gq_duel_random() returns jsonb
language plpgsql security definer set search_path to '' as $$
declare v uuid := gridquake.me(); d gridquake.duels%rowtype;
begin
  select * into d from gridquake.duels
    where status = 'open' and kind = 'm20' and from_id <> v and from_score is not null and created_at > now() - interval '14 days'
    order by created_at limit 1 for update skip locked;
  if d.id is not null then
    update gridquake.duels set status = 'matched', to_id = v where id = d.id returning * into d;
  else
    insert into gridquake.duels (mode, from_id) values ('random', v) returning * into d;
  end if;
  return gridquake.duel_json(d, v);
end $$;

create or replace function public.gq_duel_submit(p_duel uuid, p_score integer, p_prog integer[]) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare v uuid := gridquake.me(); d gridquake.duels%rowtype;
begin
  if p_score is null or p_score < 0 or p_score > 20 * 3000 + 20000 or p_prog is null or cardinality(p_prog) > 20 then
    return jsonb_build_object('status', 'rejected'); end if;
  select * into d from gridquake.duels where id = p_duel for update;
  if d.id is null or (d.from_id <> v and d.to_id is distinct from v) then return jsonb_build_object('status', 'unknown'); end if;
  if d.kind <> 'm20' then return jsonb_build_object('status', 'wrong_kind'); end if;
  if d.from_id = v then
    if d.from_score is not null then return jsonb_build_object('status', 'already'); end if;
    update gridquake.duels set from_score = p_score, from_prog = p_prog, from_at = now() where id = d.id returning * into d;
  else
    if d.to_score is not null then return jsonb_build_object('status', 'already'); end if;
    update gridquake.duels set to_score = p_score, to_prog = p_prog, to_at = now() where id = d.id returning * into d;
  end if;
  return jsonb_build_object('status', 'accepted', 'duel', gridquake.duel_json(d, v));
end $$;

revoke execute on function gridquake.duel_random(), gridquake.duel_challenge(uuid), gridquake.duel_submit(uuid, integer, integer[]) from public, anon;
grant execute on function gridquake.duel_random(), gridquake.duel_challenge(uuid), gridquake.duel_submit(uuid, integer, integer[]) to authenticated;
revoke execute on function gridquake.duel_json(gridquake.duels, uuid) from public, anon, authenticated;
