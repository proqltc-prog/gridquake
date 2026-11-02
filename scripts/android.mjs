// Builds the Android app project, the same way as Seed & Destroy. Run with
// `npm run android` after `npm install`; GitHub Actions does this on every
// push and then builds the APK with Gradle. The android/ and www/ folders are
// generated, never edited by hand: every customisation is applied here, so
// the result is the same on every machine.
//
// Steps: copy the game into www/, create the Capacitor Android project if it
// is missing, sync the game into it, and apply our settings (portrait, full
// screen, AdMob app id, test signing key, version, and icons once they exist).
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WEB_FILES = ['index.html'];

// Play Store version code from a semantic version: 0.1.0 -> 100,
// 1.2.3 -> 10203. It must grow with every upload.
export function versionCode(version) {
  const [major, minor, patch] = version.split('.').map(Number);
  return major * 10000 + minor * 100 + patch;
}

// Sets versionCode and versionName in android/app/build.gradle.
export function setVersion(gradle, version) {
  return gradle
    .replace(/versionCode \d+/, `versionCode ${versionCode(version)}`)
    .replace(/versionName "[^"]*"/, `versionName "${version}"`);
}

// Portrait only, and the keyboard is laid over the game instead of shrinking it.
export function setPortrait(manifest) {
  if (manifest.includes('android:screenOrientation')) return manifest;
  return manifest.replace('<activity', '<activity\n            android:screenOrientation="portrait"\n            android:windowSoftInputMode="adjustNothing"');
}

// Test builds are signed with the fixed test key in android-assets, so a new
// test version installs over the previous one. This is a test key, not the
// Play key; the passwords are Android's standard debug values.
export const TEST_KEY_SHA1 = 'E1:C0:78:9C:F3:B4:71:86:46:A7:56:27:42:CE:66:C5:51:2B:C4:F0';
export const TEST_SIGNING = `
    signingConfigs {
        debug {
            storeFile file('../../android-assets/test.keystore')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }
    }`;

// Adds the test signing config to the android block of build.gradle, once.
export function setTestSigning(gradle) {
  if (gradle.includes('android-assets/test.keystore')) return gradle;
  if (!/^android \{/m.test(gradle)) throw new Error('android block not found in build.gradle');
  return gradle.replace(/^android \{/m, `android {${TEST_SIGNING}`);
}

// AdMob app id; without it the AdMob plugin crashes the app. Test builds use
// Google's test app, the Play Store build (--release) the Gridquake app.
export const ADMOB_TEST_APP_ID = 'ca-app-pub-3940256099942544~3347511713';
export const ADMOB_LIVE_APP_ID = 'ca-app-pub-8394022188610476~1310179751';
export const admobAppId = (release) => (release ? ADMOB_LIVE_APP_ID : ADMOB_TEST_APP_ID);

// Switches the copied game to live ads, for the Play Store build only. Test
// APKs for the owner and testers never show live ads.
export function setLiveAds(html) {
  if (!html.includes('const AD_LIVE=false;')) throw new Error('AD_LIVE not found in index.html');
  return html.replace('const AD_LIVE=false;', 'const AD_LIVE=true;');
}

// Adds the AdMob app id to the manifest, once.
export function setAdMobAppId(manifest, id) {
  if (manifest.includes('com.google.android.gms.ads.APPLICATION_ID')) return manifest;
  return manifest.replace(/(<application[^>]*>)/, `$1\n        <meta-data\n            android:name="com.google.android.gms.ads.APPLICATION_ID"\n            android:value="${id}" />`);
}

// Google Play only accepts apps that target this Android API level or newer.
export const PLAY_TARGET_SDK = 36;

export function targetSdk(variables) {
  const match = variables.match(/targetSdkVersion\s*=\s*(\d+)/);
  if (!match) throw new Error('targetSdkVersion not found in variables.gradle');
  return Number(match[1]);
}

function run(command) {
  console.log(`> ${command}`);
  execSync(command, { cwd: ROOT, stdio: 'inherit' });
}

function copyWeb() {
  const www = join(ROOT, 'www');
  rmSync(www, { recursive: true, force: true });
  mkdirSync(www);
  for (const file of WEB_FILES) cpSync(join(ROOT, file), join(www, file), { recursive: true });
}

function edit(path, change) {
  writeFileSync(path, change(readFileSync(path, 'utf8')));
}

function applySettings(appId, version, release) {
  const app = join(ROOT, 'android', 'app');
  const main = join(app, 'src', 'main');
  edit(join(app, 'build.gradle'), (g) => setTestSigning(setVersion(g, version)));
  edit(join(main, 'AndroidManifest.xml'), (m) => setAdMobAppId(setPortrait(m), admobAppId(release)));
  // Full screen: our MainActivity hides the status and navigation bars.
  const activity = join(main, 'java', ...appId.split('.'), 'MainActivity.java');
  writeFileSync(activity, readFileSync(join(ROOT, 'android-assets', 'MainActivity.java'), 'utf8').replace('PACKAGE', appId));
  // Our icons and splash screen replace the Capacitor defaults, once they exist.
  const ownRes = join(ROOT, 'android-assets', 'res');
  if (existsSync(ownRes)) {
    const res = join(main, 'res');
    for (const dir of readdirSync(res)) {
      if (dir.startsWith('drawable')) rmSync(join(res, dir, 'splash.png'), { force: true });
    }
    cpSync(ownRes, res, { recursive: true });
  }
}

export function main(argv = process.argv) {
  const release = argv.includes('--release'); // the Play Store build
  const { version } = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  const { appId } = JSON.parse(readFileSync(join(ROOT, 'capacitor.config.json'), 'utf8'));
  copyWeb();
  if (release) edit(join(ROOT, 'www', 'index.html'), setLiveAds);
  if (!existsSync(join(ROOT, 'android'))) run('npx cap add android');
  run('npx cap sync android');
  applySettings(appId, version, release);
  const sdk = targetSdk(readFileSync(join(ROOT, 'android', 'variables.gradle'), 'utf8'));
  if (sdk < PLAY_TARGET_SDK) throw new Error(`targetSdk ${sdk} is too old for Google Play (needs ${PLAY_TARGET_SDK})`);
  console.log(`Android project ready: ${appId} version ${version} (code ${versionCode(version)}), targetSdk ${sdk}, ${release ? 'LIVE ads (Play Store)' : 'test ads'}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
