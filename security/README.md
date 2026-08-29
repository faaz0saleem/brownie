# 🔐 Admin password-guessing bot (defensive audit)

A small, dependency-free tool that tests how well the **Fudgio admin login**
(`POST /api/login`) resists automated password guessing — and reports what, if
anything, fought back.

> **Authorized use only.** Run this against a Fudgio instance **you own or are
> explicitly allowed to test**. It defaults to `http://localhost:3000` and
> refuses to hit a non-local host unless you pass `--confirm`.

## Why this exists

The admin dashboard is protected by a single shared password (`ADMIN_TOKEN`).
On a default deployment the login endpoint has two weaknesses this bot surfaces:

1. **No rate limiting or lockout.** `POST /api/login` answers every wrong guess
   with a plain `401` — as fast as you can send them. Nothing slows an attacker
   down.
2. **reCAPTCHA is off by default.** Server-side verification only runs when
   `RECAPTCHA_PROJECT_ID` **and** `RECAPTCHA_API_KEY` are set. When they aren't,
   the check is skipped, so any non-empty `recaptchaToken` sails through. The bot
   sends a dummy token to demonstrate this.

Combine those with a weak/guessable `ADMIN_TOKEN` (the shipped default,
`Faaz12345`, is a name + `12345`) and the admin panel is brute-forceable in
seconds. This tool proves it so you can fix it.

## Usage

```bash
# 1) start the admin server in one terminal
npm run admin              # → http://localhost:3000

# 2) audit it in another
npm run audit:admin
# or:
node security/password-bot.js
```

### Common options

```bash
# Add your own wordlist(s) (e.g. SecLists / rockyou), comma-separated
node security/password-bot.js --wordlist security/wordlists/common-passwords.txt,rockyou.txt

# Seed name/brand mutations (owner name, brand, pet, etc.) — the bot builds
# variants like Name123, Name@2025, N4m3! automatically
node security/password-bot.js --names faaz,fudgio,karachi

# Brute force short passwords (keep the length small — it grows exponentially)
node security/password-bot.js --brute --charset digits --min 4 --max 6

# Throttle to look at how the endpoint behaves under a gentler rate
node security/password-bot.js --concurrency 1 --delay 500 --verbose

# Audit a remote instance you own (must acknowledge authorization)
node security/password-bot.js --target https://admin.fudgio.com --confirm
```

Run `node security/password-bot.js --help` for the full list.

### What it reports

- Whether a password was found, which one, and on which attempt.
- Throughput (guesses/sec) and total time.
- Any **defences** observed: `429` rate limiting, `403` reCAPTCHA/WAF blocks,
  `400` rejections, network throttling.
- A plain-English **assessment** and prioritized **recommendations**.

Exit code is `0` when a password is found, `1` when it isn't, and non-zero for
usage/connection errors — handy in CI.

## How it guesses

1. **Built-in wordlist** — `wordlists/common-passwords.txt` (common/default/weak).
2. **Your wordlists** — anything passed via `--wordlist`.
3. **Mutations** — brand + `--names` seeds run through common patterns
   (`Cap`, `l33t`, `+123 / +12345 / +year`, trailing `! @ #`, `-admin`, …).
   This is what catches "Companyname123!"-style passwords.
4. **Brute force** *(optional, `--brute`)* — every string over a charset for a
   length range. Use only for short passwords; the space explodes fast.

## Fixing what it finds

If this bot gets in, harden the endpoint in `src/server-admin.js`:

- **Rate-limit `/api/login`** per IP *and* per account, with exponential
  backoff and a temporary lockout after N failures.
- **Turn on reCAPTCHA Enterprise verification** by setting
  `RECAPTCHA_PROJECT_ID` and `RECAPTCHA_API_KEY` (see `.env.example`), so a
  dummy token no longer passes.
- **Use a strong, random `ADMIN_TOKEN`** — e.g. `openssl rand -base64 24` — and
  never commit it (rotate the default that currently lives in `.env.example`).
- Longer term, replace the single shared static token with real admin accounts
  and hashed credentials.

Then re-run the bot — a hardened endpoint should throttle or block it and never
reveal the password.
