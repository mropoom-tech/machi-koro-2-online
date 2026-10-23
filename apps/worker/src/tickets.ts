// Short-lived signed tickets that let room members load the (non-public) card images.
// The ticket is not the player's session token, so it is acceptable inside an <img> URL.

const TICKET_TTL_MS = 12 * 60 * 60 * 1000;
const enc = new TextEncoder();

async function hmac(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(data));
  return btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function issueCardTicket(secret: string | undefined, code: string): Promise<string | null> {
  if (!secret) return null;
  const exp = Date.now() + TICKET_TTL_MS;
  return `${code}.${exp}.${await hmac(secret, `${code}.${exp}`)}`;
}

export async function verifyCardTicket(secret: string | undefined, ticket: string | null): Promise<boolean> {
  if (!secret || !ticket) return false;
  const [code, expStr, sig] = ticket.split('.');
  const exp = Number(expStr);
  if (!code || !sig || !Number.isFinite(exp) || exp < Date.now()) return false;
  const expected = await hmac(secret, `${code}.${exp}`);
  if (expected.length !== sig.length) return false;
  let diff = 0;
  for (let i = 0; i < sig.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  return diff === 0;
}
