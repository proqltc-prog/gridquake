-- Server tests for the wallet (gq09) and the fixed username (gq10).
-- Run in the Supabase SQL editor (project seed-and-destroy). Everything runs in one block that ends with
-- an error on purpose: the error message holds the result and the whole block is rolled back, so the
-- temporary test account and its data never stay in the database.
-- Expected: "SERVERTEST ok=37 fout=0" and "NAAMTEST ok=30 fout=0".

do $$
declare t uuid := gen_random_uuid(); r jsonb; o text := ''; ok int := 0; bad int := 0; c0 int;
begin
  insert into auth.users(id, instance_id, aud, role, is_anonymous, created_at, updated_at) values (t,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',true,now(),now());
  perform set_config('request.jwt.claims', json_build_object('sub', t, 'role','authenticated')::text, true);
  r := gridquake.wallet(); if (r->>'coins')::int=100 and (r->'items'->>'hamer')::int=1 and (r->>'wheel_free')::bool then ok:=ok+1; else bad:=bad+1; o:=o||' S1'; end if;
  r := gridquake.buy('zetten'); if r->>'status'='ok' and (r->'wallet'->>'coins')::int=10 then ok:=ok+1; else bad:=bad+1; o:=o||' S2a'; end if;
  r := gridquake.buy('hamer'); if r->>'status'='poor' and (r->'wallet'->>'coins')::int=10 then ok:=ok+1; else bad:=bad+1; o:=o||' S2b'; end if;
  r := gridquake.buy('goud'); if r->>'status'='unknown' then ok:=ok+1; else bad:=bad+1; o:=o||' S3'; end if;
  r := gridquake.use_item('raket'); if r->>'status'='none' then ok:=ok+1; else bad:=bad+1; o:=o||' S4a'; end if;
  r := gridquake.use_item('hamer'); if r->>'status'='used' and (r->'wallet'->'items'->>'hamer')::int=0 then ok:=ok+1; else bad:=bad+1; o:=o||' S4b'; end if;
  r := gridquake.use_item('hamer'); if r->>'status'='none' then ok:=ok+1; else bad:=bad+1; o:=o||' S4c'; end if;
  r := gridquake.ad_claim('spin'); if r->>'status'='not_needed' then ok:=ok+1; else bad:=bad+1; o:=o||' S5'; end if;
  r := gridquake.wheel_spin(); if r->>'status'='ok' and (r->>'seg')::int between 0 and 9 then ok:=ok+1; else bad:=bad+1; o:=o||' S6a'; end if;
  r := gridquake.wheel_spin(); if r->>'status'='cooldown' then ok:=ok+1; else bad:=bad+1; o:=o||' S6b'; end if;
  r := gridquake.ad_claim('spin'); if r->>'status'='granted' and (r->'wallet'->>'extra')::int=1 then ok:=ok+1; else bad:=bad+1; o:=o||' S7a'; end if;
  r := gridquake.ad_claim('spin'); if r->>'status'='limit' then ok:=ok+1; else bad:=bad+1; o:=o||' S7b'; end if;
  r := gridquake.wheel_spin(); if r->>'status'='ok' then ok:=ok+1; else bad:=bad+1; o:=o||' S7c'; end if;
  r := gridquake.wheel_spin(); if r->>'status'='cooldown' then ok:=ok+1; else bad:=bad+1; o:=o||' S7d'; end if;
  r := gridquake.wallet(); c0 := (r->>'coins')::int;
  r := gridquake.ad_claim('coins'); if r->>'status'='granted' and (r->'wallet'->>'coins')::int=c0+100 and (r->'wallet'->>'ad_wait')::int between 1790 and 1800 then ok:=ok+1; else bad:=bad+1; o:=o||' S8a'; end if;
  r := gridquake.ad_claim('coins'); if r->>'status'='cooldown' then ok:=ok+1; else bad:=bad+1; o:=o||' S8b'; end if;
  update gridquake.wallets set last_ad_at = now() - interval '31 minutes' where player_id = t;
  r := gridquake.ad_claim('coins'); if r->>'status'='granted' then ok:=ok+1; else bad:=bad+1; o:=o||' S9'; end if;
  update gridquake.wallets set ad_views = 10, last_ad_at = now() - interval '2 hours' where player_id = t;
  r := gridquake.ad_claim('coins'); if r->>'status'='limit' then ok:=ok+1; else bad:=bad+1; o:=o||' S10'; end if;
  update gridquake.wallets set wheel_day = wheel_day - 1, extra_day = extra_day - 1, ad_day = ad_day - 1 where player_id = t;
  r := gridquake.wallet(); if (r->>'wheel_free')::bool and (r->>'extra_possible')::bool and (r->>'ads_left')::int=10 and (r->>'reset_in')::int between 1 and 90000 then ok:=ok+1; else bad:=bad+1; o:=o||' S11'; end if;
  r := gridquake.earn_level(5, 2); if (r->>'gain')::int=20 then ok:=ok+1; else bad:=bad+1; o:=o||' S12a'; end if;
  r := gridquake.earn_level(5, 3); if (r->>'gain')::int=5 then ok:=ok+1; else bad:=bad+1; o:=o||' S12b'; end if;
  r := gridquake.earn_level(5, 3); if (r->>'gain')::int=3 then ok:=ok+1; else bad:=bad+1; o:=o||' S12c'; end if;
  r := gridquake.earn_level(5, 1); if (r->>'gain')::int=0 then ok:=ok+1; else bad:=bad+1; o:=o||' S12d'; end if;
  r := gridquake.earn_level(3, 1); if jsonb_typeof(r->'chest')='object' then ok:=ok+1; else bad:=bad+1; o:=o||' S13a'; end if;
  update gridquake.wallets set last_replay_at = null where player_id = t;
  r := gridquake.earn_level(3, 1); if jsonb_typeof(r->'chest')='null' then ok:=ok+1; else bad:=bad+1; o:=o||' S13b'; end if;
  r := gridquake.earn_level(221, 3); if r->>'status'='rejected' then ok:=ok+1; else bad:=bad+1; o:=o||' S14a'; end if;
  r := gridquake.earn_level(10, 4); if r->>'status'='rejected' then ok:=ok+1; else bad:=bad+1; o:=o||' S14b'; end if;
  r := gridquake.earn_classic('g1', 30000); if (r->>'gain')::int=20 then ok:=ok+1; else bad:=bad+1; o:=o||' S15a'; end if;
  r := gridquake.earn_classic('g1', 60000); if (r->>'gain')::int=10 then ok:=ok+1; else bad:=bad+1; o:=o||' S15b'; end if;
  r := gridquake.earn_classic('g1', 90000); if (r->>'gain')::int=0 then ok:=ok+1; else bad:=bad+1; o:=o||' S15c'; end if;
  r := gridquake.earn_classic('g2', -5); if r->>'status'='rejected' then ok:=ok+1; else bad:=bad+1; o:=o||' S15d'; end if;
  update gridquake.wallets set last_ad_at = null, ad_views = 0 where player_id = t;
  r := gridquake.record_ssv('tx-test-1', t, 'coins'); if r->>'status'='granted' then ok:=ok+1; else bad:=bad+1; o:=o||' S16a'; end if;
  r := gridquake.record_ssv('tx-test-1', t, 'coins'); if r->>'status'='duplicate' then ok:=ok+1; else bad:=bad+1; o:=o||' S16b'; end if;
  r := gridquake.record_ssv('tx-test-2', gen_random_uuid(), 'coins'); if r->>'status'='unknown' then ok:=ok+1; else bad:=bad+1; o:=o||' S16c'; end if;
  r := gridquake.record_ssv('tx-test-3', t, 'goud'); if r->>'status'='ignored' then ok:=ok+1; else bad:=bad+1; o:=o||' S16d'; end if;
  if not has_function_privilege('authenticated','gridquake.record_ssv(text,uuid,text)','execute') and not has_function_privilege('authenticated','gridquake.grant_ad(uuid,text)','execute')
     and not has_function_privilege('anon','gridquake.wallet()','execute') and has_function_privilege('authenticated','gridquake.wallet()','execute')
     and not has_function_privilege('authenticated','gridquake.profile_json(uuid)','execute') and not has_table_privilege('authenticated','gridquake.wallets','select') then ok:=ok+1; else bad:=bad+1; o:=o||' S17'; end if;
  begin update gridquake.wallets set coins = -1 where player_id = t; bad:=bad+1; o:=o||' S18'; exception when check_violation then ok:=ok+1; end;
  raise exception 'SERVERTEST ok=% fout=% %', ok, bad, o;
end $$;

do $$
declare t uuid := gen_random_uuid(); r jsonb; o text := ''; ok int := 0; bad int := 0; x text;
begin
  foreach x in array array['Blokbaas','Zoë_99','Jean-Luc','Ab1','Mia Rose','DROP TABLE'] loop
    if gridquake.valid_nickname(x) then ok:=ok+1; else bad:=bad+1; o:=o||' valid?'||x; end if; end loop;
  foreach x in array array['ab','Dit is veel te lang 123','<script>','a__b','_abc','abc-','Ana  Bo','12345','Аdmin','name'||chr(8203)||'x','x;drop','😀abc','a b c d e f g h i'] loop
    if not gridquake.valid_nickname(x) then ok:=ok+1; else bad:=bad+1; o:=o||' invalid?'||x; end if; end loop;
  foreach x in array array['Admin','4dm1n','Grid_Quake','modERator77','Pr0qltc'] loop
    if gridquake.reserved_nickname(x) then ok:=ok+1; else bad:=bad+1; o:=o||' reserved?'||x; end if; end loop;
  insert into auth.users(id, instance_id, aud, role, is_anonymous, created_at, updated_at) values (t,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',true,now(),now());
  perform set_config('request.jwt.claims', json_build_object('sub', t, 'role','authenticated')::text, true);
  r := public.gq_register('<b>hi</b>','nl'); if r->>'status'='invalid' then ok:=ok+1; else bad:=bad+1; o:=o||' R1'; end if;
  r := public.gq_register('4dm1n','nl'); if r->>'status'='blocked' then ok:=ok+1; else bad:=bad+1; o:=o||' R2'; end if;
  r := public.gq_register('Testnaam Qz','nl'); if r->>'status'='ok' then ok:=ok+1; else bad:=bad+1; o:=o||' R3'; end if;
  r := public.gq_register('Andere Naam','nl'); if r->>'status'='locked' and r->'profile'->>'nickname'='Testnaam Qz' then ok:=ok+1; else bad:=bad+1; o:=o||' R4'; end if;
  r := public.gq_register('Testnaam Qz','fr'); if r->>'status'='ok' then ok:=ok+1; else bad:=bad+1; o:=o||' R5'; end if;
  if (select nickname from gridquake.players where id=t)='Testnaam Qz' then ok:=ok+1; else bad:=bad+1; o:=o||' R6'; end if;
  raise exception 'NAAMTEST ok=% fout=% %', ok, bad, o;
end $$;
