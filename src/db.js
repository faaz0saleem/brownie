// Tiny JSON-file backed data store. No native deps, no external DB.
// Persists everything to data/db.json and writes atomically.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

const DEFAULT_DATA = {
  products: [],
  orders: [],
  users: [],
  meta: { orderSeq: 1000 }
};

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

let cache = null;

export function load() {
  if (cache) return cache;
  ensureDir();
  if (fs.existsSync(DB_FILE)) {
    try {
      cache = JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
    } catch (e) {
      console.error('DB parse error, starting fresh:', e.message);
      cache = structuredClone(DEFAULT_DATA);
    }
  } else {
    cache = structuredClone(DEFAULT_DATA);
    save();
  }
  // backfill any missing top-level keys
  for (const k of Object.keys(DEFAULT_DATA)) {
    if (!(k in cache)) cache[k] = structuredClone(DEFAULT_DATA[k]);
  }
  return cache;
}

export function save() {
  ensureDir();
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(cache, null, 2));
  fs.renameSync(tmp, DB_FILE);
}

export function db() {
  return load();
}

export function nextOrderId() {
  const d = load();
  d.meta.orderSeq += 1;
  return 'BB-' + d.meta.orderSeq;
}

export function id() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
