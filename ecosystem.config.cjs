// PM2 process definitions — runs the storefront and admin as two services.
// Start both with:  pm2 start ecosystem.config.cjs
// They read configuration (ports, DB, secrets) from your .env file.
module.exports = {
  apps: [
    {
      name: 'fudgio-shop',
      script: 'src/server-shop.js',
      instances: 1,
      autorestart: true,
      max_restarts: 10,
      env: { NODE_ENV: 'production' }
    },
    {
      name: 'fudgio-admin',
      script: 'src/server-admin.js',
      instances: 1,
      autorestart: true,
      max_restarts: 10,
      env: { NODE_ENV: 'production' }
    }
  ]
};
