# 🍫 Brownie Bliss

A beautiful, gradient-rich **brownie e-commerce store** with a full **admin dashboard**.
Cash on Delivery only. No external database, no build step — just Node + Express.

![COD only](https://img.shields.io/badge/Payment-Cash%20on%20Delivery-4ccf8f)

## ✨ Features

### Storefront (port **4000**)
- Gorgeous gradient landing page with hero, menu, and story sections
- Every brownie has its own **product page**
- Customers pick **flavour** and **quantity** per product
- Slide-out cart with live totals and free delivery over Rs 2000
- **Cash on Delivery** checkout with name, phone, city, address
- Live stock indicators ("Only N left", "Sold out")

### Admin dashboard (port **3000**)
- Password-protected login (default: `brownie-admin`)
- **Dashboard**: revenue, orders, brownies sold, customers, avg order value, out-of-stock count
- **14-day sales chart** + best-seller ranking + orders-by-city + status pipeline
- **Orders**: full list with customer, location, items, totals — update status (Pending → Delivered) or cancel (auto-restocks)
- **Inventory**: adjust price/stock, mark out of stock, hide products, see units sold & revenue per product
- **Customers**: everyone who ordered, with their city, address, order count and lifetime spend

## 🚀 Run it

```bash
npm install
npm start          # shop → http://localhost:4000   admin → http://localhost:3000
```

Or run them separately:

```bash
npm run shop       # http://localhost:4000
npm run admin      # http://localhost:3000
```

### Configuration (env vars)
| Var | Default | Purpose |
|-----|---------|---------|
| `SHOP_PORT` | `4000` | Storefront port |
| `ADMIN_PORT` | `3000` | Admin port |
| `ADMIN_TOKEN` | `brownie-admin` | Admin password |

## 🗂️ Project structure
```
src/
  db.js            JSON-file data store (data/db.json)
  seed.js          Seeds the brownie catalog on first run
  store.js         Business logic (orders, stock, analytics)
  server-shop.js   Storefront server (4000)
  server-admin.js  Admin server (3000)
  start.js         Runs both together
public/            Storefront (index, product page, cart, checkout)
admin/             Admin dashboard (login, analytics, orders, inventory, customers)
```

Data persists to `data/db.json`. Delete it to reset the store.

Made with 💛 and a lot of chocolate.
