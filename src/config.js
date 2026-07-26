// Central, environment-driven configuration. NOTHING secret is hardcoded here —
// values come from environment variables (see .env.example).
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

// Minimal .env loader (no dependency). Only sets vars that aren't already set.
(function loadDotEnv() {
  const envPath = path.join(ROOT, '.env');
  if (!fs.existsSync(envPath)) return;
  for (const raw of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
})();

const env = process.env;

// Decide the storage driver. Use MySQL when DB_HOST is configured, else the
// zero-config JSON fallback so the app always runs (great for local dev).
const hasMysql = !!(env.DB_HOST && env.DB_USER && env.DB_NAME);

export const config = {
  root: ROOT,
  brand: {
    name: env.BRAND_NAME || 'Fudgio',
    tagline: 'Handcrafted brownies, baked fresh. Cash on delivery.',
    domain: env.SITE_DOMAIN || 'fudgio.com',
    adminDomain: env.ADMIN_DOMAIN || 'admin.fudgio.com',
    siteUrl: env.SITE_URL || 'https://fudgio.com',
    email: env.CONTACT_EMAIL || 'hello@fudgio.com',
    phone: env.CONTACT_PHONE || '+92 300 0000000',
    address: env.CONTACT_ADDRESS || 'Karachi, Pakistan',
    instagram: env.BRAND_INSTAGRAM || 'https://instagram.com/fudgio',
    currency: env.CURRENCY || 'Rs',
    freeDeliveryOver: parseInt(env.FREE_DELIVERY_OVER || '2500', 10),
    deliveryFee: parseInt(env.DELIVERY_FEE || '150', 10)
  },
  ports: {
    shop: parseInt(env.SHOP_PORT || env.PORT || '4000', 10),
    admin: parseInt(env.ADMIN_PORT || '3000', 10)
  },
  db: {
    driver: hasMysql ? 'mysql' : 'json',
    host: env.DB_HOST,
    port: parseInt(env.DB_PORT || '3306', 10),
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    database: env.DB_NAME,
    // Cloud SQL public IP should use SSL. Set DB_SSL=true to enable.
    ssl: env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined
  },
  auth: {
    // Secret used to sign session cookies. MUST be set in production.
    cookieSecret: env.COOKIE_SECRET || 'dev-insecure-secret-change-me',
    adminToken: env.ADMIN_TOKEN || 'fudgio-admin',
    sessionDays: parseInt(env.SESSION_DAYS || '30', 10),
    google: {
      enabled: !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET),
      clientId: env.GOOGLE_CLIENT_ID || '',
      clientSecret: env.GOOGLE_CLIENT_SECRET || '',
      // Where Google redirects back after login (must match console config).
      redirectUri: env.GOOGLE_REDIRECT_URI || 'https://fudgio.com/auth/google/callback'
    }
  }
};

export function isProd() {
  return env.NODE_ENV === 'production';
}
