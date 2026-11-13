// Edge Function gq-admob-ssv: Google AdMob calls this URL after a Gridquake rewarded video was
// watched to the end (server-side verification, SSV). The signature is checked with Google's public
// keys; a valid video is paid once through gridquake.record_ssv (coins or an extra wheel spin).
// Deployed without JWT check: Google cannot sign in, the signature is the proof.
// The app sends user_id = its anonymous login and custom_data = 'coins' or 'spin'.
import { KEYS_URL, verifyCallback, rewardRequest } from './verify.js';

let keys = null;
async function googleKeys(fresh = false) {
  if (!keys || fresh) keys = (await (await fetch(KEYS_URL)).json()).keys;
  return keys;
}

Deno.serve(async (req) => {
  const query = new URL(req.url).search.slice(1);
  let params = await verifyCallback(query, await googleKeys(), crypto.subtle);
  // Google rotates its keys now and then: fetch them again once.
  if (!params) params = await verifyCallback(query, await googleKeys(true), crypto.subtle);
  if (!params) return new Response('invalid signature', { status: 400 });
  const reward = rewardRequest(params);
  if (!reward) return new Response('ok'); // AdMob's own test call, or a video for an in-game reward
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const res = await fetch(`${Deno.env.get('SUPABASE_URL')}/rest/v1/rpc/record_ssv`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'Content-Profile': 'gridquake' },
    body: JSON.stringify(reward),
  });
  // A failure makes Google try again later; a duplicate is fine.
  return new Response(res.ok ? 'ok' : 'error', { status: res.ok ? 200 : 500 });
});
