# 🚀 Fudgio — Deployment & Go-Live Guide

This guide takes Fudgio from code to a real store selling brownies at **fudgio.com**,
with the admin at **admin.fudgio.com**.

> ⚠️ **Before anything else — security**
> - The database password you shared in chat should be treated as **compromised**. Rotate it in
>   Google Cloud → SQL → *fudgio* → **Users** and put the new one only in `.env` (never in git).
> - Never commit `.env`. It is already git-ignored.
> - Generate a strong `COOKIE_SECRET` and a strong `ADMIN_TOKEN` (see below).

---

## 0. What kind of Hostinger hosting do you need?

Fudgio is a **Node.js application** (it needs a running server for the database, logins and orders).
That means **static/shared web hosting is not enough** on its own. You need one of:

| Option | Works? | Notes |
|--------|--------|-------|
| **Hostinger VPS** | ✅ Best | Full control. Recommended. Steps below target this. |
| **Hostinger “Node.js” app hosting** (Business/Cloud with Node) | ✅ | Use their Node app manager; set the start command to `npm run shop` and run admin separately. |
| Static/shared hosting only | ❌ | Can’t run Node. You’d host the backend elsewhere (Railway/Render/Fly) and point `fudgio.com` at it. |

The steps below assume a **VPS (Ubuntu)**, which is the most reliable path and cheap on Hostinger.

---

## 1. Provision the server

SSH into your Hostinger VPS and install Node 18+ and PM2:

```bash
sudo apt update && sudo apt install -y nginx git
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm i -g pm2
```

## 2. Get the code

```bash
git clone https://github.com/faaz0saleem/brownie.git fudgio
cd fudgio
npm install --omit=dev
cp .env.example .env
nano .env        # fill in real values (see section 4)
```

## 3. Google Cloud SQL (MySQL)

1. In Google Cloud → **SQL**, your instance `fudgio` (connection name `hungter:us-central1:fudgio`) already exists.
2. **Create the database**: SQL → *fudgio* → **Databases** → *Create database* → name it `fudgio`.
3. **Create a dedicated user** (don’t use root): **Users** → *Add user* → e.g. `fudgio_app` with a strong password.
4. **Lock down access** (pick one):
   - **Authorized networks** (public IP): SQL → *fudgio* → **Connections** → *Networks* → add your VPS’s public IP only.
     Enable **SSL/TLS** and require it.
   - **Cloud SQL Auth Proxy** (recommended, no IP allow-listing): run the proxy on the VPS and point `DB_HOST=127.0.0.1`.
5. Put the values in `.env`:
   ```
   DB_HOST=<cloud sql public IP, or 127.0.0.1 if using the proxy>
   DB_PORT=3306
   DB_USER=fudgio_app
   DB_PASSWORD=<the new strong password>
   DB_NAME=fudgio
   DB_SSL=true
   ```
   On first boot the app **creates all tables automatically**.

> Tables: `products`, `users`, `orders`, `counters`. Seed data (the 3 flavours) is inserted automatically if the catalog is empty.

## 4. Configure `.env`

Minimum production values:

```bash
NODE_ENV=production
SITE_URL=https://fudgio.com
ADMIN_TOKEN=$(openssl rand -hex 24)          # your admin password
COOKIE_SECRET=$(openssl rand -hex 48)        # session signing secret
# DB_* as in section 3
# GOOGLE_* as in section 6 (optional but requested)
CONTACT_EMAIL=hello@fudgio.com
CONTACT_PHONE=+92 3xx xxxxxxx
```
(Generate the secrets and paste the output — don’t keep the `$(...)`.)

## 5. Run both apps with PM2

```bash
pm2 start "npm run shop"  --name fudgio-shop
pm2 start "npm run admin" --name fudgio-admin
pm2 save
pm2 startup      # follow the printed command so it survives reboots
```

Shop listens on `4000`, admin on `3000` (change with `SHOP_PORT` / `ADMIN_PORT`).

## 6. Google Sign-In (OAuth)

1. Google Cloud → **APIs & Services → Credentials → Create OAuth client ID → Web application**.
2. **Authorized redirect URI**: `https://fudgio.com/auth/google/callback`
3. Copy the client ID/secret into `.env`:
   ```
   GOOGLE_CLIENT_ID=...
   GOOGLE_CLIENT_SECRET=...
   GOOGLE_REDIRECT_URI=https://fudgio.com/auth/google/callback
   ```
4. Restart: `pm2 restart fudgio-shop`. The “Continue with Google” button appears automatically when configured.
   (Email + password sign-in works with or without this.)

## 7. DNS — point the domains at the server

In your DNS (Hostinger hPanel → DNS):

| Type | Name | Value |
|------|------|-------|
| A | `@` (fudgio.com) | your VPS IP |
| A | `admin` (admin.fudgio.com) | your VPS IP |
| A | `www` | your VPS IP |

## 8. Nginx — route the two subdomains

`/etc/nginx/sites-available/fudgio`:

```nginx
server {
  server_name fudgio.com www.fudgio.com;
  location / { proxy_pass http://127.0.0.1:4000; proxy_set_header Host $host; proxy_set_header X-Forwarded-For $remote_addr; proxy_set_header X-Forwarded-Proto $scheme; }
}
server {
  server_name admin.fudgio.com;
  location / { proxy_pass http://127.0.0.1:3000; proxy_set_header Host $host; proxy_set_header X-Forwarded-For $remote_addr; proxy_set_header X-Forwarded-Proto $scheme; }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/fudgio /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

## 9. HTTPS (free SSL)

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d fudgio.com -d www.fudgio.com -d admin.fudgio.com
```

Certbot rewrites the Nginx config to serve HTTPS and auto-renews.

## 10. Auto-deploy on push (optional)

On the VPS, a simple deploy hook:
```bash
cd /path/to/fudgio && git pull && npm install --omit=dev && pm2 restart fudgio-shop fudgio-admin
```
Wire this to a GitHub Action or a webhook. (Hostinger’s Git auto-deploy can run this on push.)

---

# ✅ Go-Live Checklist — what’s stopping you from selling *today*

The app is **functionally complete**. These are the real-world steps before public marketing:

### Must-do (blockers)
- [ ] **Rotate the leaked DB password** and set a strong `ADMIN_TOKEN` + `COOKIE_SECRET`.
- [ ] **Run on a Node-capable host** (VPS / Node hosting) — static hosting can’t run it.
- [ ] **Provision the database** (create DB + app user, lock down access, enable SSL).
- [ ] **Point DNS** for `fudgio.com` and `admin.fudgio.com` at the server; enable **HTTPS**.
- [ ] **Set real contact details** (`CONTACT_EMAIL`, `CONTACT_PHONE`, address, Instagram) in `.env`.
- [ ] **Set real prices, stock and delivery settings** (`FREE_DELIVERY_OVER`, `DELIVERY_FEE`, currency).
- [ ] **Add real brownie photos** in the admin (Products & Stock → Add image).
- [ ] **Define your delivery area** and update the FAQ/checkout copy accordingly.

### Should-do before marketing
- [ ] **Order notifications** — right now orders appear in the admin dashboard. Add email/WhatsApp/SMS
      alerts so you’re notified instantly (Nodemailer for email, or a WhatsApp/Twilio integration).
      *This is the single most valuable next feature for a live store.*
- [ ] **Test a full real order** end-to-end (place → see in admin → advance status → customer tracks it).
- [ ] **Backups** — schedule Cloud SQL automated backups.
- [ ] **Google Business + Analytics** — verify the site in Google Search Console, add analytics, submit `sitemap.xml`.
- [ ] **Legal** — review the Privacy Policy & Terms (templates are included) for your jurisdiction.
- [ ] **Rate-limiting / anti-spam** on order and auth endpoints (e.g. `express-rate-limit`) to prevent abuse.
- [ ] **A real business email** (hello@fudgio.com) and phone/WhatsApp number customers can reach.

### Nice-to-have (post-launch)
- [ ] Discount / promo codes, minimum-order rules per area.
- [ ] Delivery time-slot selection at checkout.
- [ ] Admin export of orders to CSV; sales reports by date range.
- [ ] Product reviews/ratings; “bestseller” automation.
- [ ] Password reset via email; phone OTP option.

---

## Notes on payments
Fudgio is **Cash on Delivery only** by design — there is no card/online payment path anywhere.
Nothing sensitive (cards/bank details) is ever collected or stored.
