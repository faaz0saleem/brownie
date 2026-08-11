# 🚀 Fudgio — Deployment & Go-Live Guide

This guide takes Fudgio from code to a real store selling brownies at **fudgio.com**,
with the admin at **admin.fudgio.com**.

> 🚨 **Before anything else — rotate these two passwords**
>
> This repository is **public**, and commit `8400dfc` put both the mailbox
> password and the database password into `.env`, which is committed. Anyone
> who reads the repo can see them, and they stay in the git history even after
> the file is changed.
>
> 1. **Mailbox password** — hPanel → **Emails** → `faaz.saleem@fudgio.com` →
>    change password. (It is the same string as the admin password, so change
>    that too: `ADMIN_TOKEN`.)
> 2. **Cloud SQL password** — Google Cloud → SQL → *fudgio* → **Users**.
> 3. Put the new values in **`public_html/.env.local`** on the server (see
>    below) — never in `.env`.
>
> Making the repository private limits further exposure but does not undo it;
> rotating is what actually fixes it.

---

## ✉️ Email setup — optional, but do it

**You can take orders without this.** Checkout is gated by an image security
check (a CAPTCHA) generated on your own server, not by an emailed code, so no
mail configuration is required for the shop to work.

What email is still used for: the **order alert** sent to you when someone
orders. Without SMTP configured you will not get that alert — you would have
to watch the admin dashboard instead. That is the only thing you lose.

1. In hPanel → **Emails**, make sure the mailbox `faaz.saleem@fudgio.com` exists
   and you know its password.
2. Create **`public_html/.env.local`** (hPanel → File Manager → New File) with
   just the password:

   ```
   SMTP_PASS=<the mailbox password>
   ```

   Everything else (`SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`,
   `SMTP_FROM`) is already in the committed `.env`.

   > **Never put a password in `.env`.** That file is committed, this
   > repository is public, and every git deploy overwrites it on the server.
   > `.env.local` is git-ignored, is never deployed, and overrides `.env`.

3. Test it: open `/api/diag/mail?token=<admin password>&to=you@example.com`.
   It reports the settings it is using and the real error from the send, so a
   failure can be fixed rather than guessed at.
4. To keep the alerts out of spam, add **SPF** and **DKIM** DNS records for
   fudgio.com (hPanel → Emails → *Email accounts* → **DNS settings** shows the
   exact records to paste into your DNS zone).

If `SMTP_PASS` is blank the code falls back to PHP `mail()`, which most shared
hosts either block or deliver straight to spam — so set it properly.

### Switching to Cloud SQL

Same file. The site stays on the safe SQLite store until **`DB_HOST`** is set —
setting `DB_PASSWORD` on its own does nothing. Add both to `.env.local`:

```
DB_HOST=<the Cloud SQL public IP>
DB_PASSWORD=<the database password>
```

Check it took effect at `https://fudgio.com/api/health` — `driver` should read
`mysql` instead of `sqlite`.

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
CONTACT_EMAIL=faaz.saleem@fudgio.com
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
2. **Authorised JavaScript origins:**
   ```
   https://fudgio.com
   https://www.fudgio.com
   ```
3. **Authorised redirect URIs:**
   ```
   https://fudgio.com/auth/google/callback
   https://www.fudgio.com/auth/google/callback
   ```
4. Copy the client ID/secret into `.env` (`GOOGLE_REDIRECT_URI` must exactly match a URI above):
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

## 10. Auto-deploy on push (CI/CD)

A ready-to-use GitHub Actions workflow is included at **`.github/workflows/deploy.yml`**.
On every push to `main` it SSHes into your server, pulls the latest code, installs deps and
reloads PM2. To enable it, add these **repository secrets** in
GitHub → *Settings → Secrets and variables → Actions*:

| Secret | Value |
|--------|-------|
| `HOSTINGER_HOST` | your VPS IP / hostname |
| `HOSTINGER_USER` | SSH user (e.g. `root`) |
| `HOSTINGER_SSH_KEY` | the **private** SSH key that can log in |
| `HOSTINGER_PORT` | SSH port (optional, default 22) |
| `APP_DIR` | absolute path to the app on the server |

> **Note on Hostinger’s built-in Git integration:** on **shared/web hosting** it only *pulls files*
> — it does **not** run Node, so the app won’t start there. Use a **VPS** (the workflow above) or
> Hostinger’s **Node.js app** feature (set the app’s start command to run `pm2 start ecosystem.config.cjs`,
> or two apps with `npm run shop` and `npm run admin`).

---

## Troubleshooting — “the website / admin isn’t working”

Work through these in order:

1. **Is Node actually running the app?** On the server: `pm2 status` (should show `fudgio-shop` and
   `fudgio-admin` **online**). If they’re not there: `pm2 start ecosystem.config.cjs && pm2 save`.
   If PM2/Node isn’t installed, you’re on shared hosting → see section 0.
2. **Check the logs** — this is where the real error is: `pm2 logs --lines 50`.
   A clear `❌ Fudgio … failed to start` block means a **database** problem (next step).
3. **Health check** — hit `https://fudgio.com/healthz` and `https://admin.fudgio.com/healthz`.
   - `{"ok":true,...}` → the app is fine; any 404/502 is an Nginx/DNS/SSL issue (sections 7–9).
   - `{"ok":false,"error":...}` or the app crash-looping → **database** connection problem:
     - Add the **server’s public IP** to Cloud SQL → *Connections → Authorized networks*.
     - Set **`DB_SSL=true`** in `.env` (Cloud SQL public IP requires SSL).
     - Verify `DB_HOST` is the Cloud SQL **public IP**, and `DB_USER` / `DB_PASSWORD` / `DB_NAME` are correct.
     - Make sure the **database `fudgio` exists** (Cloud SQL → Databases → Create database).
     - After fixing `.env`: `pm2 restart fudgio-shop fudgio-admin --update-env`.
4. **Ports/Nginx** — shop listens on `4000`, admin on `3000`. Nginx must proxy
   `fudgio.com → 4000` and `admin.fudgio.com → 3000` (section 8), then `sudo systemctl reload nginx`.
5. **DNS/SSL** — `fudgio.com` and `admin.fudgio.com` must both point to the server (section 7) and
   have certificates (section 9). A browser “not secure” / connection-refused usually means these.

Quick self-test locally (no DB needed — uses the JSON fallback):
```bash
npm start
curl localhost:4000/healthz   # {"ok":true,...}
curl localhost:3000/healthz   # {"ok":true,...}
```

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
- [x] **Order notifications** — built in. Every new order emails you (set `SMTP_*` and `ORDER_NOTIFY_TO`)
      and/or POSTs to a webhook (`ORDER_WEBHOOK_URL`) you can point at WhatsApp Cloud API / Zapier /
      Slack. Just add your SMTP or webhook details to `.env`. Orders also always appear in the admin.
- [ ] **Test a full real order** end-to-end (place → see in admin → advance status → customer tracks it).
- [ ] **Backups** — schedule Cloud SQL automated backups.
- [ ] **Google Business + Analytics** — verify the site in Google Search Console, add analytics, submit `sitemap.xml`.
- [ ] **Legal** — review the Privacy Policy & Terms (templates are included) for your jurisdiction.
- [ ] **Rate-limiting / anti-spam** on order and auth endpoints (e.g. `express-rate-limit`) to prevent abuse.
- [ ] **A real business email** (faaz.saleem@fudgio.com) and phone/WhatsApp number customers can reach.

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
