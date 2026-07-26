// Entry point for Hostinger "Setup Node.js App" (and any Node host that runs a
// single startup file). Runs the Fudgio storefront (fudgio.com) and listens on
// the port the host provides via process.env.PORT.
//
// In hPanel → Advanced → Node.js App:
//   • Application root      = this project's folder
//   • Application startup file = app.js
//   • Node.js version       = 18 or newer
// Then click "Run NPM Install", add your environment variables, and Start.
//
// (The admin dashboard runs as a SEPARATE Node.js app using src/server-admin.js
//  as its startup file — set that up later on the admin.fudgio.com subdomain.)
import { startShop } from './src/server-shop.js';

startShop().catch((err) => {
  console.error('Failed to start Fudgio shop:', err);
  process.exit(1);
});
