-- Gridquake 0.7: a username is chosen once and can never be changed afterwards; stricter name rules.
--   * 3 to 16 characters; Latin letters (also with accents), digits; one space, - or _ only between
--     two letters or digits; at least 2 letters. No other symbols, no invisible or look-alike characters.
--   * Not allowed: words on the blocked list (also written with digits, like "l33t"), and names that
--     pretend to be the game or its staff.
--   * Existing names stay as they are; the rules apply to new names.
-- The blocked word list public.banned_words belongs to Seed & Destroy: it is only read here, never changed.
-- Undo: restore gridquake.valid_nickname and public.gq_register from migration gq01 and drop gridquake.reserved_nickname.

create or replace function gridquake.valid_nickname(p text) returns boolean language sql immutable set search_path = ''
as $$
  select coalesce(
    char_length(p) between 3 and 16
    and p ~ '^[A-Za-z0-9À-ÖØ-öø-ÿ]([A-Za-z0-9À-ÖØ-öø-ÿ]|[ _-](?=[A-Za-z0-9À-ÖØ-öø-ÿ]))*$'
    and char_length(regexp_replace(p, '[^A-Za-zÀ-ÖØ-öø-ÿ]', '', 'g')) >= 2,
  false);
$$;

-- names that pretend to be the game or its staff, also with digits for letters
create or replace function gridquake.reserved_nickname(p text) returns boolean language sql immutable set search_path = ''
as $$
  select translate(regexp_replace(lower(coalesce(p, '')), '[ _-]', '', 'g'), '013457', 'oieast')
    ~ '(admin|moderator|gridquake|proqltc|support|official|offici|staff|system|anthropic|google)';
$$;

CREATE OR REPLACE FUNCTION public.gq_register(p_nickname text, p_lang text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v uuid := auth.uid(); n text := regexp_replace(btrim(coalesce(p_nickname, '')), '\s+', ' ', 'g'); cur text;
begin
  if v is null then raise exception 'not signed in' using errcode = '28000'; end if;
  -- a name is chosen once: the same name again only updates the language
  select nickname into cur from gridquake.players where id = v;
  if cur is not null and cur <> n then return jsonb_build_object('status', 'locked', 'profile', gridquake.profile_json(v)); end if;
  if cur is null then
    if not gridquake.valid_nickname(n) then return jsonb_build_object('status', 'invalid'); end if;
    if public.is_blocked_username(n) or public.is_blocked_username(translate(lower(n), '013457', 'oieast'))
       or gridquake.reserved_nickname(n) then return jsonb_build_object('status', 'blocked'); end if;
    if exists (select 1 from gridquake.players where lower(nickname) = lower(n) and id <> v) then
      return jsonb_build_object('status', 'taken'); end if;
  end if;
  begin
    insert into gridquake.players (id, nickname, lang)
      values (v, n, case when p_lang in ('nl','fr','de','en') then p_lang else 'en' end)
      on conflict (id) do update set lang = excluded.lang, last_seen_at = now();
  exception when unique_violation then
    return jsonb_build_object('status', 'taken');
  end;
  return jsonb_build_object('status', 'ok', 'profile', gridquake.profile_json(v));
end $function$;

revoke execute on function gridquake.valid_nickname(text), gridquake.reserved_nickname(text) from public, anon, authenticated;
