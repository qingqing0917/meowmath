import * as oauth from 'oauth4webapi';
import { SignJWT, jwtVerify, createRemoteJWKSet } from 'jose';
import { ApiError, initialState, isLocal, isOwner } from './state.mjs';

const google = { issuer: 'https://accounts.google.com',
  authorization_endpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  token_endpoint: 'https://oauth2.googleapis.com/token',
  jwks_uri: 'https://www.googleapis.com/oauth2/v3/certs' };
const googleKeys = createRemoteJWKSet(new URL(google.jwks_uri));
export const now = () => Math.floor(Date.now() / 1000);
export async function hash(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}
export function cookieValue(request, name) {
  const match = request.headers.get('Cookie')?.split(';').map(part => part.trim())
    .find(part => part.startsWith(`${name}=`));
  return match ? match.slice(name.length + 1) : null;
}
function cookie(request, name, value, age) {
  return `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${age}` +
    (new URL(request.url).protocol === 'https:' ? '; Secure' : '');
}
export async function authenticate(request, env, required = true) {
  const token = cookieValue(request, 'cat_session');
  const user = token ? await env.DB.prepare(`SELECT users.* FROM sessions
    JOIN users ON users.id = sessions.user_id WHERE token_hash = ? AND expires_at > ?`)
    .bind(await hash(token), now()).first() : null;
  if (!user && required) throw new ApiError(401, '请先登录', 'unauthenticated');
  return user;
}
export function publicUser(user, env) {
  return user ? { id: user.id, email: user.email, name: user.display_name,
    unlimitedFish: isOwner(user, env) } : null;
}
async function createSession(request, env, identity) {
  const id = crypto.randomUUID();
  await env.DB.prepare(`INSERT INTO users (id, google_sub, email, email_verified, display_name, created_at)
    VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(google_sub) DO UPDATE SET
    email=excluded.email, email_verified=excluded.email_verified, display_name=excluded.display_name`)
    .bind(id, identity.sub, identity.email, identity.email_verified ? 1 : 0,
      String(identity.name || identity.email).slice(0, 100), now()).run();
  const user = await env.DB.prepare('SELECT * FROM users WHERE google_sub = ?').bind(identity.sub).first();
  const token = oauth.generateRandomState();
  await env.DB.batch([
    env.DB.prepare('INSERT OR IGNORE INTO saves (user_id, state_json, fish, revision, updated_at) VALUES (?, ?, 0, 0, ?)')
      .bind(user.id, JSON.stringify(initialState()), now()),
    env.DB.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)')
      .bind(await hash(token), user.id, now() + 7 * 86400),
    env.DB.prepare('DELETE FROM sessions WHERE expires_at <= ?').bind(now()),
    env.DB.prepare('DELETE FROM rounds WHERE expires_at < ?').bind(now() - 86400),
    env.DB.prepare('DELETE FROM operations WHERE created_at < ?').bind(now() - 7 * 86400)
  ]);
  return cookie(request, 'cat_session', token, 7 * 86400);
}
function oauthConfig(request, env) {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.SESSION_SECRET ||
    env.SESSION_SECRET.length < 32) throw new ApiError(503, 'Google 登录尚未配置', 'oauth_not_configured');
  const origin = isLocal(request, env) ? new URL(request.url).origin : env.PUBLIC_ORIGIN;
  if (!origin || (!isLocal(request, env) && new URL(origin).protocol !== 'https:')) {
    throw new ApiError(503, '网站登录地址尚未配置');
  }
  return { origin: new URL(origin).origin,
    redirectUri: `${new URL(origin).origin}/auth/google/callback`,
    client: { client_id: env.GOOGLE_CLIENT_ID },
    secret: new TextEncoder().encode(env.SESSION_SECRET) };
}
export async function authRoute(request, env, path) {
  if (path === '/auth/local' && request.method === 'POST') {
    if (!isLocal(request, env)) throw new ApiError(404, '页面不存在');
    const input = await request.json();
    if (!['owner', 'player'].includes(input.account)) throw new ApiError(400, '测试账号不正确');
    const owner = input.account === 'owner';
    const sessionCookie = await createSession(request, env, {
      sub: owner ? 'local-owner' : 'local-player',
      email: owner ? env.OWNER_EMAIL : 'player@local.test', email_verified: true,
      name: owner ? '本地测试：我的账号' : '本地测试：普通账号'
    });
    return Response.json({ ok: true }, { headers: { 'Set-Cookie': sessionCookie } });
  }
  if (path === '/auth/logout' && request.method === 'POST') {
    const token = cookieValue(request, 'cat_session');
    if (token) await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await hash(token)).run();
    return Response.json({ ok: true }, { headers: { 'Set-Cookie': cookie(request, 'cat_session', '', 0) } });
  }
  if (path === '/auth/google' && request.method === 'GET') {
    const config = oauthConfig(request, env);
    const state = oauth.generateRandomState();
    const verifier = oauth.generateRandomCodeVerifier();
    const nonce = oauth.generateRandomNonce();
    const signed = await new SignJWT({ state, verifier, nonce, origin: config.origin })
      .setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('10m').sign(config.secret);
    const url = new URL(google.authorization_endpoint);
    url.search = new URLSearchParams({ client_id: config.client.client_id, redirect_uri: config.redirectUri,
      response_type: 'code', scope: 'openid email profile', state, nonce,
      code_challenge: await oauth.calculatePKCECodeChallenge(verifier), code_challenge_method: 'S256',
      prompt: 'select_account' }).toString();
    return new Response(null, { status: 302, headers: { Location: url.href,
      'Set-Cookie': cookie(request, 'cat_oauth', signed, 600) } });
  }
  if (path === '/auth/google/callback' && request.method === 'GET') {
    const config = oauthConfig(request, env);
    try {
      const signed = cookieValue(request, 'cat_oauth');
      if (!signed) throw new Error('missing state');
      const { payload } = await jwtVerify(signed, config.secret, { algorithms: ['HS256'] });
      if (payload.origin !== config.origin) throw new Error('origin mismatch');
      const params = oauth.validateAuthResponse(google, config.client, new URL(request.url), payload.state);
      const response = await oauth.authorizationCodeGrantRequest(google, config.client,
        oauth.ClientSecretPost(env.GOOGLE_CLIENT_SECRET), params, config.redirectUri, payload.verifier);
      const tokens = await oauth.processAuthorizationCodeResponse(google, config.client, response,
        { expectedNonce: payload.nonce, requireIdToken: true });
      const { payload: identity } = await jwtVerify(tokens.id_token, googleKeys,
        { issuer: google.issuer, audience: env.GOOGLE_CLIENT_ID, algorithms: ['RS256'] });
      if (identity.nonce !== payload.nonce || identity.email_verified !== true ||
        typeof identity.sub !== 'string' || typeof identity.email !== 'string') throw new Error('invalid identity');
      const headers = new Headers({ Location: config.origin + '/' });
      headers.append('Set-Cookie', await createSession(request, env, identity));
      headers.append('Set-Cookie', cookie(request, 'cat_oauth', '', 0));
      return new Response(null, { status: 302, headers });
    } catch {
      return new Response(null, { status: 302, headers: { Location: config.origin + '/?login_error=1',
        'Set-Cookie': cookie(request, 'cat_oauth', '', 0) } });
    }
  }
  throw new ApiError(404, '页面不存在');
}
