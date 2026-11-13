// Verification of AdMob server-side verification (SSV) callbacks.
// Plain JavaScript without dependencies, so the Edge Function (Deno) and the tests (Node) use the same code.
// https://developers.google.com/admob/android/ssv
// The signature check is the same as in Seed & Destroy's admob-ssv; only rewardRequest differs.

export const KEYS_URL = 'https://www.gstatic.com/admob/reward/verifier-keys.json';

// The signed message is everything in the query before "&signature="; signature and key_id are always the last two parameters.
export function splitCallback(query) {
  const at = query.indexOf('&signature=');
  if (at < 0) return null;
  const params = new URLSearchParams(query);
  return { message: query.slice(0, at), signature: params.get('signature'), keyId: params.get('key_id'), params };
}

// Bytes of a base64 or base64url string.
export function base64ToBytes(text) {
  const b64 = text.replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

// An ECDSA signature in DER (as Google sends it) to the 64-byte r||s form that WebCrypto verifies.
export function derToRaw(der) {
  let at = 2;
  const integer = () => {
    const length = der[at + 1];
    let value = der.slice(at + 2, at + 2 + length);
    at += 2 + length;
    while (value.length > 32 && value[0] === 0) value = value.slice(1);
    const out = new Uint8Array(32);
    out.set(value, 32 - value.length);
    return out;
  };
  const raw = new Uint8Array(64);
  raw.set(integer(), 0);
  raw.set(integer(), 32);
  return raw;
}

// Checks the callback against Google's public keys. Returns the parameters when the signature is valid, otherwise null.
export async function verifyCallback(query, keys, subtle) {
  const parts = splitCallback(query);
  if (!parts?.signature || !parts.keyId) return null;
  const key = keys.find((k) => String(k.keyId) === parts.keyId);
  if (!key) return null;
  try {
    const publicKey = await subtle.importKey('spki', base64ToBytes(key.base64), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    const ok = await subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, publicKey,
      derToRaw(base64ToBytes(parts.signature)), new TextEncoder().encode(parts.message));
    return ok ? parts.params : null;
  } catch {
    return null;
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// What a verified callback asks for: coins or an extra wheel spin for a player, or nothing
// (AdMob's own test request has no user id; in-game rewards such as +5 moves need no server).
export function rewardRequest(params) {
  const player = params.get('user_id') ?? '';
  const tx = params.get('transaction_id') ?? '';
  const kind = params.get('custom_data') ?? '';
  if (!UUID.test(player) || !tx || (kind !== 'coins' && kind !== 'spin')) return null;
  return { p_tx: tx, p_player: player, p_kind: kind };
}
