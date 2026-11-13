// Tests for the AdMob callback check (supabase/functions/gq-admob-ssv/verify.js): node tests/ssv.test.mjs
import { webcrypto } from 'node:crypto';
import { verifyCallback, rewardRequest } from '../supabase/functions/gq-admob-ssv/verify.js';
const { subtle } = webcrypto;
let pass = 0, fail = 0;
const check = (name, ok) => { ok ? pass++ : fail++; console.log((ok ? 'PASS ' : 'FAIL ') + name); };

// a key pair that plays Google; the signature goes out in DER like Google sends it
const pair = await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const spki = Buffer.from(await subtle.exportKey('spki', pair.publicKey)).toString('base64');
const keys = [{ keyId: 42, base64: spki }];
function toDer(raw) {
  const int = b => { let i = 0; while (i < b.length - 1 && b[i] === 0) i++; b = b.slice(i); if (b[0] & 0x80) b = Buffer.concat([Buffer.from([0]), b]); return Buffer.concat([Buffer.from([2, b.length]), b]); };
  const r = int(Buffer.from(raw.slice(0, 32))), s = int(Buffer.from(raw.slice(32)));
  return Buffer.concat([Buffer.from([0x30, r.length + s.length]), r, s]);
}
async function signed(message, keyId = 42) {
  const raw = new Uint8Array(await subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, pair.privateKey, new TextEncoder().encode(message)));
  return `${message}&signature=${toDer(raw).toString('base64url')}&key_id=${keyId}`;
}
const player = '0f8fad5b-d9cb-469f-a165-70867728950e';
const msg = `ad_network=5450213213286189855&ad_unit=1234&custom_data=coins&reward_amount=1&reward_item=Reward&timestamp=1&transaction_id=abc123&user_id=${player}`;

const good = await signed(msg);
const p = await verifyCallback(good, keys, subtle);
check('valid signature is accepted', !!p);
check('reward: coins for the player', JSON.stringify(rewardRequest(p)) === JSON.stringify({ p_tx: 'abc123', p_player: player, p_kind: 'coins' }));
check('changed amount (tampered message) is refused', !(await verifyCallback(good.replace('custom_data=coins', 'custom_data=spin'), keys, subtle)));
check('unknown key id is refused', !(await verifyCallback(await signed(msg, 7), keys, subtle)));
check('missing signature is refused', !(await verifyCallback(msg, keys, subtle)));
check('garbage signature is refused', !(await verifyCallback(msg + '&signature=AAAA&key_id=42', keys, subtle)));
check('spin reward', rewardRequest(new URLSearchParams(`custom_data=spin&transaction_id=t1&user_id=${player}`)).p_kind === 'spin');
check('in-game reward (no custom data) asks nothing', rewardRequest(new URLSearchParams(`transaction_id=t1&user_id=${player}`)) === null);
check('unknown custom data asks nothing', rewardRequest(new URLSearchParams(`custom_data=goud&transaction_id=t1&user_id=${player}`)) === null);
check('no user id (AdMob test call) asks nothing', rewardRequest(new URLSearchParams('custom_data=coins&transaction_id=t1')) === null);
check('user id that is not a uuid asks nothing', rewardRequest(new URLSearchParams("custom_data=coins&transaction_id=t1&user_id=1' or 1=1")) === null);
console.log(`${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);
