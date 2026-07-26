// Picks the storage driver based on config and exposes a single `store`.
import { config } from '../config.js';
import { createJsonStore } from './json-store.js';
import { createMysqlStore } from './mysql-store.js';

export const store = config.db.driver === 'mysql' ? createMysqlStore() : createJsonStore();

let initPromise = null;
export function initStore() {
  if (!initPromise) initPromise = store.init().then(() => {
    console.log(`💾 Data store ready (driver: ${store.driver})`);
  });
  return initPromise;
}
