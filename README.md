# Gridquake: Block Puzzle

Block-puzzle game for smartphones (`be.proqltc.gridquake`). It is built the same way as Seed & Destroy: the game is one web page (`index.html`), and Capacitor wraps it into an Android app.

## Test version on your phone
Every push builds a test APK (workflow **Android app**). To install it, open the run in the **Actions** tab, download the artifact `gridquake-apk`, unzip it and install `app-debug.apk` on your Android phone. Every test build is signed with the same test key, so a new version installs over the old one.

## Google Play version
1. Run **Create upload key** once (Actions → Create upload key → Run workflow). From the `upload-key` artifact:
   - put the contents of `upload.keystore.base64.txt` in the secret `ANDROID_UPLOAD_KEYSTORE`;
   - put the contents of `password.txt` in the secret `ANDROID_UPLOAD_PASSWORD`;
   - keep `upload.keystore` somewhere safe.
2. Publish a release, or run **Play Store build** by hand. The artifact `gridquake-play` holds the signed `.aab` for Google Play.

## Status
- Game: the current prototype, offline only. Online features (leaderboards, duels, friends) still need to be wired to the Supabase functions `gq_*`.
- Ads: still placeholders in the game. The AdMob plugin is in the build, but with Google's test app id. The live id goes in `scripts/android.mjs` once Gridquake exists in AdMob.
- Icon and splash screen: Capacitor defaults until `android-assets/res/` exists.
- iOS: not yet (Apple Developer account needed first).
