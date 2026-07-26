// Boots both apps in one process: storefront + admin.
// In production they typically run as two processes behind Nginx
// (fudgio.com → shop, admin.fudgio.com → admin). This is for local dev.
import { startShop } from './server-shop.js';
import { startAdmin } from './server-admin.js';

await startShop();
await startAdmin();
