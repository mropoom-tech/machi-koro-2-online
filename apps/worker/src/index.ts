import { CODE_ALPHABET, CODE_RE, normalizeCode } from '@mk2/game-engine';
import { verifyCardTicket } from './tickets';

export { GameRoom } from './room';

export interface Env {
  GAME_ROOM: DurableObjectNamespace;
  /** Comma-separated list of allowed browser origins, or "*" for local development. */
  ALLOWED_ORIGINS: string;
  /** Secret used to sign card-image tickets (`wrangler secret put CARD_SIGNING_KEY`). */
  CARD_SIGNING_KEY?: string;
  ASSETS?: Fetcher;
}

function originAllowed(env: Env, origin: string | null): boolean {
  const list = (env.ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  if (list.includes('*')) return true;
  return !!origin && list.includes(origin);
}

function cors(env: Env, req: Request): Record<string, string> {
  const origin = req.headers.get('Origin');
  if (!originAllowed(env, origin)) return {};
  return {
    'Access-Control-Allow-Origin': origin ?? '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'content-type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function withCors(res: Response, headers: Record<string, string>): Response {
  const r = new Response(res.body, res);
  for (const [k, v] of Object.entries(headers)) r.headers.set(k, v);
  return r;
}

function randomCode(): string {
  const a = crypto.getRandomValues(new Uint8Array(5));
  return [...a].map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
}

const stubFor = (env: Env, code: string) => env.GAME_ROOM.get(env.GAME_ROOM.idFromName(code));

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const h = cors(env, req);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: h });
    if (req.headers.get('Origin') && !originAllowed(env, req.headers.get('Origin'))) {
      return new Response('origin not allowed', { status: 403 });
    }

    if (url.pathname === '/api/health') return withCors(Response.json({ ok: true }), h);

    // Card images: only for holders of a valid room ticket (images loaded via <img>, so no Origin header).
    const card = url.pathname.match(/^\/cards\/(th|en)\/([a-z_]+)\.webp$/);
    if (card && req.method === 'GET') {
      if (!env.ASSETS || !(await verifyCardTicket(env.CARD_SIGNING_KEY, url.searchParams.get('t')))) {
        return new Response('forbidden', { status: 403 });
      }
      const res = await env.ASSETS.fetch(new Request(new URL(`/${card[1]}/${card[2]}.webp`, url.origin)));
      if (!res.ok) return new Response('not found', { status: 404 });
      const out = new Response(res.body, res);
      out.headers.set('Cache-Control', 'private, max-age=43200');
      out.headers.set('X-Robots-Tag', 'noindex');
      return out;
    }

    if (url.pathname === '/api/rooms' && req.method === 'POST') {
      const body = await req.text();
      for (let attempt = 0; attempt < 5; attempt++) {
        const code = randomCode();
        const res = await stubFor(env, code).fetch(`https://room/create?code=${code}`, { method: 'POST', body });
        if (res.status !== 409) return withCors(res, h);
      }
      return withCors(Response.json({ error: 'err_create_failed' }, { status: 503 }), h);
    }

    const m = url.pathname.match(/^\/api\/rooms\/([^/]+)\/(join|ws)$/);
    if (m) {
      const code = normalizeCode(decodeURIComponent(m[1]));
      if (!CODE_RE.test(code)) return withCors(Response.json({ error: 'err_bad_code' }, { status: 400 }), h);
      const stub = stubFor(env, code);
      if (m[2] === 'join' && req.method === 'POST') {
        return withCors(await stub.fetch(`https://room/join?code=${code}`, { method: 'POST', body: await req.text() }), h);
      }
      if (m[2] === 'ws') {
        // Authentication happens over the socket ("hello" + token) so the token never appears in a URL.
        return stub.fetch(`https://room/ws?code=${code}`, { headers: req.headers });
      }
    }

    return withCors(Response.json({ error: 'not found' }, { status: 404 }), h);
  },
};
