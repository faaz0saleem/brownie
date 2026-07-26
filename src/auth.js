// Authentication: email+password, Google OAuth, and stateless signed-cookie
// sessions so returning customers are logged in automatically.
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { store } from './data/index.js';
import { config } from './config.js';

const COOKIE = 'fud_session';

// ---------- signed cookie sessions ----------
function sign(value) {
  const mac = crypto.createHmac('sha256', config.auth.cookieSecret).update(value).digest('base64url');
  return `${value}.${mac}`;
}
function unsign(signed) {
  if (!signed || !signed.includes('.')) return null;
  const idx = signed.lastIndexOf('.');
  const value = signed.slice(0, idx);
  const mac = signed.slice(idx + 1);
  const expected = crypto.createHmac('sha256', config.auth.cookieSecret).update(value).digest('base64url');
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  return value;
}

export function issueSession(res, userId) {
  const exp = Date.now() + config.auth.sessionDays * 864e5;
  const token = sign(`${userId}|${exp}`);
  res.cookie(COOKIE, token, {
    httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production',
    maxAge: config.auth.sessionDays * 864e5, path: '/'
  });
}
export function clearSession(res) {
  res.clearCookie(COOKIE, { path: '/' });
}
export function readSession(req) {
  const raw = req.cookies?.[COOKIE];
  const value = unsign(raw);
  if (!value) return null;
  const [userId, exp] = value.split('|');
  if (!userId || !exp || Date.now() > Number(exp)) return null;
  return userId;
}

// Express middleware: attaches req.user (or null) from the session cookie.
export function attachUser() {
  return async (req, res, next) => {
    req.user = null;
    const userId = readSession(req);
    if (userId) {
      try {
        const u = await store.getUserById(userId);
        if (u) req.user = publicUser(u);
      } catch { /* ignore */ }
    }
    next();
  };
}

export function publicUser(u) {
  if (!u) return null;
  return {
    id: u.id, name: u.name, email: u.email, phone: u.phone, avatarUrl: u.avatarUrl,
    city: u.city, address: u.address, orders: u.orders, totalSpent: u.totalSpent
  };
}

// ---------- email + password ----------
export async function registerWithEmail({ name, email, password, phone }) {
  if (!name || !email || !password) return { error: 'Name, email and password are required.' };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: 'Please enter a valid email address.' };
  if (password.length < 6) return { error: 'Password must be at least 6 characters.' };
  const existing = await store.getUserByEmail(email);
  if (existing) return { error: 'An account with this email already exists. Try logging in.' };
  const passwordHash = await bcrypt.hash(password, 10);
  const user = await store.createUser({ name: name.trim(), email: email.toLowerCase().trim(), passwordHash, phone: phone || null });
  return { user };
}

export async function loginWithEmail({ email, password }) {
  if (!email || !password) return { error: 'Email and password are required.' };
  const user = await store.getUserByEmail(email);
  if (!user || !user.passwordHash) return { error: 'Invalid email or password.' };
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return { error: 'Invalid email or password.' };
  await store.updateUser(user.id, { lastLoginAt: Date.now() });
  return { user };
}

// ---------- Google OAuth (raw fetch, no SDK) ----------
export function googleAuthUrl(state) {
  const p = new URLSearchParams({
    client_id: config.auth.google.clientId,
    redirect_uri: config.auth.google.redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state, access_type: 'offline', prompt: 'select_account'
  });
  return 'https://accounts.google.com/o/oauth2/v2/auth?' + p.toString();
}

export async function googleExchange(code) {
  const body = new URLSearchParams({
    code, client_id: config.auth.google.clientId, client_secret: config.auth.google.clientSecret,
    redirect_uri: config.auth.google.redirectUri, grant_type: 'authorization_code'
  });
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body
  });
  if (!tokenRes.ok) throw new Error('Google token exchange failed');
  const { access_token } = await tokenRes.json();
  const infoRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: 'Bearer ' + access_token }
  });
  if (!infoRes.ok) throw new Error('Google userinfo failed');
  return infoRes.json(); // { id, email, name, picture, ... }
}

export async function upsertGoogleUser(profile) {
  let user = await store.getUserByGoogleId(profile.id);
  if (!user && profile.email) user = await store.getUserByEmail(profile.email);
  if (user) {
    user = await store.updateUser(user.id, {
      googleId: profile.id, avatarUrl: user.avatarUrl || profile.picture,
      name: user.name || profile.name, lastLoginAt: Date.now()
    });
  } else {
    user = await store.createUser({
      name: profile.name || 'Fudgio Friend', email: (profile.email || '').toLowerCase() || null,
      googleId: profile.id, avatarUrl: profile.picture || null
    });
  }
  return user;
}

// CSRF-ish state token for the OAuth round-trip.
export function makeState() { return crypto.randomBytes(16).toString('hex'); }
export { sign as _sign, unsign as _unsign };
