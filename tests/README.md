# Tests

## Engine and browser tests (UAT and negative)

1. Start the local web server: `node scripts/serve-web.mjs . 5178`
2. Open `http://localhost:5178/index.html?test=1` in a desktop browser (use a test profile: the tests change the game data stored in that browser).
3. In the browser console run:
   ```js
   (await import('/tests/uat.mjs')).run()
   ```
   The result is a list with `PASS`/`FAIL` per test.

The page only exposes the test hook `window.GQ` on `localhost` with `?test=1`, never in the Android app. Only `index.html` is copied into the app (`scripts/android.mjs`), so the files in this folder never ship.

## Test run 0.7.0 (13 November 2026)

59 of 59 browser tests passed (the wallet against a fake server with the same rules), 37 + 30 + 16 server tests (`tests/server-wallet.sql`, rolled back) and 11 signature tests (`node tests/ssv.test.mjs`). The 2 manual checks M3-M4 still apply; M1-M2 (wallet data on the device) no longer apply: the wallet is on the server now (N26).

| ID | Type | Test | Result |
|---|---|---|---|
| U1 | UAT | Menu shows coins, Daily wheel and Shop | pass |
| U2 | UAT | Daily wheel: one spin gives a prize and is saved | pass |
| U3 | UAT | Shop: buying lowers coins and adds the helper | pass |
| U4 | UAT | Classic: helper bar shown, no power blocks after 2 lines | pass |
| U5 | UAT | Turn: block turns a quarter, one helper used | pass |
| U6 | UAT | New blocks: tray replaced by blocks that fit | pass |
| U7 | UAT | Hammer: clears one block, costs no move | pass |
| U8 | UAT | Classic game over: record message, coins, "3 new blocks" continues the game | pass |
| U9 | UAT | Level start with Starter Rocket and +3 moves | pass |
| U10 | UAT | Level won: coins, win streak +1, gift box after level 3 | pass |
| U11 | UAT | Level lost, Retry: win streak back to 0 | pass |
| U12 | UAT | Power combo: rocket next to bomb goes off together | pass |
| U13 | UAT | Last move: warning and red edge | pass |
| U14 | UAT | Duel: no helper bar | pass |
| U15 | UAT | English: new texts translated | pass |
| U16 | UAT | Friends on the campaign map | pass |
| U17 | UAT | Crystal Mine is map 10, before the master test (map 11); 220 levels | pass |
| U18 | UAT | A crystal falls when the line below is cleared and is collected | pass |
| U19 | UAT | A crystal level is won when all crystals are down | pass |
| N1 | negative | Buying without enough coins | pass |
| N2 | negative | 5 fast clicks with coins for one item | pass |
| N3 | negative | Daily wheel twice on the same day | pass |
| N4 | negative | Hammer on an empty cell costs nothing | pass |
| N5 | negative | Hammer on water or a chest costs nothing | pass |
| N6 | negative | Helper at 0: grey, does nothing, nothing used | pass |
| N7 | negative | Helper during an animation or with a card open is ignored | pass |
| N8 | negative | Starter Rocket on a full board is not used up | pass |
| N9 | negative | Gift box not given twice when replaying level 3 | pass |
| N10 | negative | Replaying a level for the same stars pays only 3 coins | pass |
| N11 | negative | Leaving a level with ✕ resets the win streak | pass |
| N12 | negative | Turning an empty tray slot costs nothing | pass |
| N13 | negative | Free streak rocket does not use a bought rocket | pass |
| N14 | negative | Friend without level or with HTML in the name (no code runs) | pass |
| N15 | negative | Hammer on a crystal costs nothing and the crystal stays | pass |
| N16 | negative | A blast or line never destroys a crystal | pass |
| N17 | negative | A block under a crystal holds it | pass |
| U20 | UAT | Coin video: +100 coins, then a 30-minute wait shown on the button | pass |
| U21 | UAT | Daily wheel: after the free spin one extra spin for a video | pass |
| U22 | UAT | Username: button at the bottom of the menu, text says it cannot be changed, then shown with a lock | pass |
| N19 | negative | Coin video during the wait does nothing | pass |
| N20 | negative | After 10 videos in a day: "Again tomorrow" | pass |
| N21 | negative | A second extra spin on the same day is refused | pass |
| N22 | negative | Wallet calls carry Content-Profile: gridquake; the older gq_ calls do not | pass |
| N23 | negative | Offline: shop says so, helpers show –, nothing used | pass |
| N24 | negative | Username rules in the app (same as the server) | pass |
| N25 | negative | Leaderboard without a name: no name button, only a pointer to the menu | pass |
| N26 | negative | Coins stored on the device are ignored | pass |
| N27 | negative | A level won right after another: no coins, but no "no connection" message | pass |
| N28 | negative | Connection lost on the game-over card: the card stays, with a message | pass |
| N29 | negative | The board is locked while the hammer is used on the server | pass |
| N30 | negative | Double tap on the coin video starts one video | pass |
| N31 | negative | The end card no longer appears after the player left | pass |
| N32 | negative | Settings show no old device-only name | pass |
| U23 | UAT | All five helpers in a column to the right of the board, inside the screen | pass |
| U24 | UAT | Rocket from the shop: tap an empty cell and it is placed | pass |
| U25 | UAT | +3 moves during a campaign level | pass |
| U26 | UAT | Out of moves: use own +3 moves from the lose card | pass |
| N33 | negative | +3 moves is grey in Classic, even with stock | pass |
| N34 | negative | Rocket on an occupied cell costs nothing | pass |
| M3 | UAT (manual) | Very first start: straight into exercise 1, no questions | pass |
| M4 | security (manual) | Without `?test=1` the test hook does not exist | pass |

## Crystal Mine tuning

- All 200 existing levels are unchanged (compared with version 0.6: identical layouts, moves and star limits; the master test only moved to levels 201-220).
- The bot is calibrated on maps 1-4: its moves and star limits match the existing tuning within 3% on average (`node scripts/tune-bot.mjs calibrate 1-80`).
- Check on 48 other games per level (`node scripts/tune-bot.mjs verify 181-200`): the bot wins 54-85% of the crystal levels within the moves (map 1: 23-94%), ★★ in 38% and ★★★ in 18% of the games on average (map 1: 39% and 18%).

Fixed after the review of pull request 1: unlimited Classic coins with new game ids, level coins without playing (now limits per time and per day, `gq11`), video rewards without confirmation now end on a fixed date, and six smaller app issues (N27-N32 and the free streak rocket on a full board).

Fixed during testing: a Starter Rocket was used up on a full board; damaged wallet data was not cleaned; replaying an easy level paid full coins every time.

Not covered: real AdMob ads and the Android share screen (need a test APK on a phone), and the online parts against the live server with two accounts.
