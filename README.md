# 🍫 Fudgio

A professional, SEO-ready **brownie e-commerce store** with a fully separate **admin dashboard**.
Cash on Delivery only. User accounts with auto-login, order tracking, and a MySQL
(Google Cloud SQL) database — with a zero-config local fallback so it runs anywhere.

- **Storefront** → `fudgio.com` (default port `4000`)
- **Admin** → `admin.fudgio.com` (default port `3000`) — private, never linked from the store

## ✨ Features

### Storefront
- Beautiful gradient landing page, multi-page site (Home, Menu, Product, About, FAQ, Contact, Track, Account, Privacy, Terms)
- **Server-rendered HTML + SEO**: per-page titles/descriptions, Open Graph, Twitter cards, JSON-LD (Bakery + Product), `robots.txt`, `sitemap.xml`, canonical URLs
- Three signature flavours — **Classic Chocolate, Nutty Delight, Salted Caramel** — from a secret small-batch recipe
- **Nut-allergy warning** on Nutty Delight (badge on cards + prominent warning on the product page)
- Box-size + quantity selection, slide-out cart, free delivery over a threshold
- **Cash on Delivery** checkout (COD is the only payment method, everywhere)
- **User accounts**: email + password *and* Google sign-in, with **auto-login** on return visits (signed session cookie)
- **Order tracking**: signed-in order history with a status timeline, plus a public “track by order number + phone” page
- Custom SVG favicon/logo and a generated social share image

### Admin dashboard (private)
- Password-protected login; the API is token-guarded
- **Analytics**: revenue, orders, brownies sold, customers, avg order value, out-of-stock, in-progress; 14-day sales chart; best-sellers; orders-by-city; status pipeline; low-stock alerts
- **Orders**: every store order lands here with customer, location & items — advance status (Pending → Confirmed → Baking → Out for Delivery → Delivered) or cancel (auto-restocks). Customers see updates instantly.
- **Products & stock**: **upload brownie photos** (auto-compressed), edit price/stock, mark out of stock, hide/show, add products, per-product units-sold & revenue
- **Customers**: everyone who ordered or registered, with contact, city, address, order count & lifetime spend

## 🚀 Run locally

```bash
npm install
cp .env.example .env      # optional for local dev — JSON store is used if no DB is set
npm start                 # shop → http://localhost:4000   admin → http://localhost:3000
```

Default admin password is `fudgio-admin` (change `ADMIN_TOKEN` in `.env`).

Run them separately (as in production):
```bash
npm run shop     # storefront only
npm run admin    # admin only
```

## 🗄️ Database

Fudgio talks to storage through one interface with two interchangeable drivers:

- **MySQL** (Google Cloud SQL) — used automatically when `DB_HOST` is set in `.env`. Tables are created on first boot.
- **JSON file** (`data/db.json`) — the zero-config fallback for local development.

No credentials are ever hardcoded — everything comes from environment variables. See `.env.example`.

## 🌐 Going live

Full production setup — Hostinger/VPS, Nginx for the two subdomains, PM2, Cloud SQL,
Google OAuth, SSL — and a **complete go-live checklist** is in **[DEPLOY.md](DEPLOY.md)**.

## 🗂️ Project structure
```
src/
  config.js            env-driven config (no secrets in code)
  data/
    index.js           driver selector
    json-store.js      JSON fallback driver
    mysql-store.js     MySQL / Cloud SQL driver
  service.js           business logic (orders, stock, analytics)
  auth.js              password hashing, sessions, Google OAuth
  layout.js            SSR layout (SEO head, header, footer)
  pages.js             server-rendered page content
  seed.js              seeds the 3 flavours
  server-shop.js       storefront (fudgio.com)
  server-admin.js      admin (admin.fudgio.com)
  start.js             runs both (local dev)
public/                storefront assets (css, js, favicon, og-image)
admin/                 admin dashboard (separate app)
```

Made with 💛 and a lot of chocolate.
