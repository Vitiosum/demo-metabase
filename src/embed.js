// Metabase static embedding: the companion app signs a short-lived JWT with
// the embedding secret key, the browser loads /embed/<kind>/<token> in an
// iframe, Metabase checks the signature and runs the question.
// The secret never leaves the server. No dependency: HS256 is one HMAC.
import { createHmac } from 'node:crypto';

const b64url = (value) => Buffer.from(value).toString('base64url');

export function signToken(payload, secret) {
  const head = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64url(JSON.stringify(payload));
  const signature = createHmac('sha256', secret).update(`${head}.${body}`).digest('base64url');
  return `${head}.${body}.${signature}`;
}

// resource: { dashboard: 12 } or { question: 34 }
// params: locked parameters, e.g. { shop: 'Montmartre' }; { shop: [] } means all shops
export function embedUrl({ siteUrl, secret, resource, params = {}, ttlSeconds = 3600, now = Date.now() }) {
  const payload = { resource, params, exp: Math.floor(now / 1000) + ttlSeconds };
  const kind = 'dashboard' in resource ? 'dashboard' : 'question';
  const url = `${siteUrl}/embed/${kind}/${signToken(payload, secret)}#bordered=false&titled=false`;
  return { url, payload };
}
