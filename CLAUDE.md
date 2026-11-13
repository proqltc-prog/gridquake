# Gridquake

Block-puzzle game (formerly "Blockers"): one web page `index.html`, wrapped by Capacitor into an Android app (`be.proqltc.gridquake`). See README.md for the full status.

## Database
- Supabase project `seed-and-destroy` (id `cmmgsnkvqcvjsxldflvo`), shared with other games. Gridquake's own schema: **`gridquake`**.
- New tables and functions go in schema `gridquake`, never in `public`. The older `public.gq_*` functions stay where they are.
- The app calls functions in `gridquake` with the header `Content-Profile: gridquake` (`API.call(name, args, false, 'gridquake')`). The schema must be listed under Data API → Exposed schemas.
- Migrations: `supabase/migrations/gqNN_*.sql`, one per change. Server tests: `tests/server-wallet.sql`.
- Never change Seed & Destroy's tables or functions in `public` (the blocked-word list `public.banned_words` is only read).

## Tests
- Browser: `node scripts/serve-web.mjs . 5178`, open `http://localhost:5178/index.html?test=1`, run `(await import('/tests/uat.mjs')).run()`.
- Signature check of AdMob callbacks: `node tests/ssv.test.mjs`.
- Level tuning bot: `node scripts/tune-bot.mjs verify 181-200`.
