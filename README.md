# Gridquake: Block Puzzle

Block-puzzle game for smartphones (`be.proqltc.gridquake`). It is built the same way as Seed & Destroy: the game is one web page (`index.html`), and Capacitor wraps it into an Android app.

## Test version on your phone
A test APK is only built on request: run **Android app** by hand (Actions → Android app → Run workflow), only after the owner approved it. Until then the game is tested in the web version. To install an APK, open the run in the **Actions** tab, download the artifact `gridquake-apk`, unzip it and install `app-debug.apk` on your Android phone. Every test build is signed with the same test key, so a new version installs over the old one.

## Google Play version
1. The upload key is made on the owner's PC and kept in `C:\Dev\Gridquake\sleutels` (never in the repository, OneDrive or a chat). Its contents go into the GitHub secrets `ANDROID_UPLOAD_KEYSTORE` (from `upload.keystore.base64.txt`) and `ANDROID_UPLOAD_PASSWORD` (from `wachtwoord.txt`), entered by the owner on the GitHub website. Key alias: `upload`.
2. Publish a release, or run **Play Store build** by hand. The artifact `gridquake-play` holds the signed `.aab` for Google Play.

## Status
- Campaign: 10 maps of 20 levels (stones, ice, chains, moss, time bombs, islands, paint, keys and chests, rising lava, mixed). A map opens after its boss (level 20). Each map has 3 goals with bronze, silver and gold medals. Moves and star limits are tuned with a bot that plays every level 24 times.
- Settings: language, theme (Light or Dark, free for everyone), sound effects and vibration switches, recovery code, ad privacy, delete.
- First start: a 4-screen guide on how the game works. The campaign starts with a practice map of 5 guided levels (place blocks, Rocket, using a Rocket, Bomb, Prism) with blocks on the board, lit target cells and an explanation above the board; map 1 opens after it. Classic has no tutorial.
- Online: leaderboards (world, week, friends), friends, duels (random and friend), campaign stars, recovery code and account deletion run on the Supabase functions `gq_*` (project seed-and-destroy, schema `gridquake`), with an anonymous login per device, the same way as Seed & Destroy. Without a connection, Classic and Campaign keep working.
- Ads: AdMob rewarded video (+5 moves, clear the board, continue) and an interstitial after every 5th game, with Google's EU consent form and a privacy-options button in Settings when Google requires it. Test APKs always use Google's test ads; only the Play Store build (`npm run android -- --release`) switches on live ads and the live app id. In a browser a short stand-in replaces the ad.
- Icon and splash screen: own design (blocks blown apart by a bomb), made with `scripts/make-icons.cjs` into `android-assets/res/`. Store icon and feature graphic in `store/`.
- iOS: not yet (Apple Developer account needed first).
