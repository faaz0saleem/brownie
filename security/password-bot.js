#!/usr/bin/env node
// Fudgio admin password-guessing bot — a DEFENSIVE security-audit tool.
//
// Purpose: let the owner of a Fudgio deployment test how well their admin
// login (POST /api/login) resists automated password guessing. It hammers the
// login with candidate passwords (a common-password wordlist, brand/name-based
// mutations, and optional brute force), reports whether/when it got in, and —
// just as importantly — whether the endpoint fought back (rate limiting,
// lockout, or working reCAPTCHA). The closing assessment turns the result into
// plain remediation advice.
//
// This is meant to be run against YOUR OWN instance. It defaults to
// http://localhost:3000 and refuses to hit a non-local host without --confirm.
//
// Usage:
//   node security/password-bot.js                     # audit local admin
//   node security/password-bot.js --wordlist rock.txt # add your own wordlist
//   node security/password-bot.js --names faaz,ali     # seed name mutations
//   node security/password-bot.js --brute --max 4      # brute force (short!)
//   node security/password-bot.js --target https://admin.example.com --confirm
//   node security/password-bot.js --help
//
// No external dependencies — Node 18+ (built-in fetch, AbortController).

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------- CLI parsing
function parseArgs(argv) {
  const opts = {
    target: 'http://localhost:3000',
    path: '/api/login',
    field: 'token',                 // JSON body field holding the password guess
    recaptchaField: 'recaptchaToken',
    recaptchaToken: 'audit-bot',    // dummy; server ignores it when enterprise verify is off
    wordlists: [],
    names: [],
    concurrency: 8,
    delay: 0,                       // ms pause per worker between attempts
    maxAttempts: 0,                 // 0 = unlimited
    timeout: 10000,
    brute: false,
    charset: 'lower',               // preset name or literal characters
    min: 1,
    max: 4,
    stopOnSuccess: true,
    confirm: false,
    quiet: false,
    verbose: false,
    help: false,
  };
  const presets = {
    lower: 'abcdefghijklmnopqrstuvwxyz',
    upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
    digits: '0123456789',
    alnum: 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
    all: 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%&*-_.',
  };
  const list = (v) => v.split(',').map((s) => s.trim()).filter(Boolean);

  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    switch (a) {
      case '-h': case '--help': opts.help = true; break;
      case '--target': case '--url': opts.target = next(); break;
      case '--path': opts.path = next(); break;
      case '--field': opts.field = next(); break;
      case '--recaptcha-token': opts.recaptchaToken = next(); break;
      case '--no-recaptcha': opts.recaptchaToken = ''; break;
      case '--wordlist': opts.wordlists.push(...list(next())); break;
      case '--names': opts.names.push(...list(next())); break;
      case '--concurrency': case '-c': opts.concurrency = Math.max(1, parseInt(next(), 10) || 1); break;
      case '--delay': opts.delay = Math.max(0, parseInt(next(), 10) || 0); break;
      case '--max-attempts': opts.maxAttempts = Math.max(0, parseInt(next(), 10) || 0); break;
      case '--timeout': opts.timeout = Math.max(1000, parseInt(next(), 10) || 10000); break;
      case '--brute': opts.brute = true; break;
      case '--charset': opts.charset = next(); break;
      case '--min': opts.min = Math.max(1, parseInt(next(), 10) || 1); break;
      case '--max': opts.max = Math.max(1, parseInt(next(), 10) || 1); break;
      case '--all': case '--no-stop': opts.stopOnSuccess = false; break;
      case '--confirm': case '--yes': opts.confirm = true; break;
      case '--quiet': case '-q': opts.quiet = true; break;
      case '--verbose': case '-v': opts.verbose = true; break;
      default:
        console.error(`Unknown option: ${a}  (try --help)`);
        process.exit(2);
    }
  }
  opts.charsetChars = presets[opts.charset] || opts.charset;
  return opts;
}

// ------------------------------------------------------------------- helpers
const isTTY = process.stdout.isTTY;
const c = (code, s) => (isTTY ? `\x1b[${code}m${s}\x1b[0m` : s);
const bold = (s) => c('1', s);
const dim = (s) => c('2', s);
const green = (s) => c('32', s);
const red = (s) => c('31', s);
const yellow = (s) => c('33', s);
const cyan = (s) => c('36', s);

function fmtDuration(ms) {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${Math.round(s - m * 60)}s`;
}

function isLocalTarget(target) {
  try {
    const h = new URL(target).hostname;
    return h === 'localhost' || h === '127.0.0.1' || h === '::1' || h === '0.0.0.0';
  } catch { return false; }
}

function printHelp() {
  console.log(`
${bold('Fudgio admin password-guessing bot')} ${dim('(defensive security audit)')}

Tests how well your admin login resists automated password guessing.
Run it against YOUR OWN instance only.

${bold('Usage')}
  node security/password-bot.js [options]

${bold('Target')}
  --target <url>        Base URL of the admin server        (default http://localhost:3000)
  --path <path>         Login endpoint path                 (default /api/login)
  --field <name>        JSON body field for the guess       (default token)
  --recaptcha-token <s> Dummy reCAPTCHA token to send       (default "audit-bot")
  --no-recaptcha        Omit the reCAPTCHA token entirely
  --confirm             Required to target a non-local host

${bold('Candidates')}
  --wordlist <files>    Extra wordlist file(s), comma-separated (one password per line)
  --names <a,b,c>       Seed words for name/brand mutations (brand name is auto-added)
  --brute               Enable brute force after the wordlist is exhausted
  --charset <name|str>  lower | upper | digits | alnum | all, or literal chars (default lower)
  --min <n> / --max <n> Brute-force length range              (default 1..4)

${bold('Behaviour')}
  --concurrency, -c <n> Parallel requests                     (default 8)
  --delay <ms>          Pause per worker between attempts      (default 0)
  --max-attempts <n>    Stop after N attempts                  (default unlimited)
  --timeout <ms>        Per-request timeout                    (default 10000)
  --all / --no-stop     Keep going after the first hit (find duplicates/weak set)
  --quiet, -q           Only print the final result
  --verbose, -v         Log every attempt
  --help, -h            This help

${bold('Examples')}
  node security/password-bot.js
  node security/password-bot.js --names faaz,fudgio --wordlist security/wordlists/common-passwords.txt
  node security/password-bot.js --brute --charset digits --min 4 --max 6
  node security/password-bot.js --target https://admin.example.com --confirm
`);
}

// -------------------------------------------------------- candidate generation
// Common weak-password suffixes/prefixes and leet substitutions used to mutate
// seed words (brand + any --names). This is exactly how real audits catch
// "Companyname123!" style passwords.
function* mutations(seeds) {
  const years = [];
  const now = new Date().getFullYear();
  for (let y = now + 1; y >= now - 8; y--) years.push(String(y));
  const numberTails = ['', '1', '12', '123', '1234', '12345', '123456', '007', '01', '11', '69', '99', '00', '2020', '2023', '2024', '2025', ...years];
  const symbolTails = ['', '!', '@', '#', '$', '!!', '123!', '@123', '#1'];
  const leet = (w) => w.replace(/a/gi, '4').replace(/e/gi, '3').replace(/o/gi, '0').replace(/i/gi, '1').replace(/s/gi, '5');

  const bases = new Set();
  for (const raw of seeds) {
    const s = String(raw).trim();
    if (!s) continue;
    const lower = s.toLowerCase();
    const cap = lower.charAt(0).toUpperCase() + lower.slice(1);
    for (const b of [lower, s, cap, s.toUpperCase(), leet(lower), lower + 'admin', lower + '-admin', 'admin' + lower]) {
      bases.add(b);
    }
  }
  for (const base of bases) {
    for (const num of numberTails) {
      for (const sym of symbolTails) {
        if (num === '' && sym === '') { yield base; continue; }
        yield base + num + sym;
      }
    }
  }
}

// Odometer-style brute force over a charset for a range of lengths.
function* bruteForce(chars, min, max) {
  const n = chars.length;
  for (let len = min; len <= max; len++) {
    const idx = new Array(len).fill(0);
    while (true) {
      let s = '';
      for (let i = 0; i < len; i++) s += chars[idx[i]];
      yield s;
      let pos = len - 1;
      while (pos >= 0) {
        if (++idx[pos] < n) break;
        idx[pos] = 0;
        pos--;
      }
      if (pos < 0) break;
    }
  }
}

function loadWordlistFiles(files) {
  const out = [];
  for (const f of files) {
    const abs = path.isAbsolute(f) ? f : path.resolve(process.cwd(), f);
    if (!fs.existsSync(abs)) {
      console.error(red(`! wordlist not found: ${f}`));
      process.exit(2);
    }
    const lines = fs.readFileSync(abs, 'utf8').split(/\r?\n/);
    for (const line of lines) {
      const p = line.replace(/\s+$/, '');
      if (p && !p.startsWith('#')) out.push(p);
    }
  }
  return out;
}

// The full candidate stream: built-in list -> user wordlists -> mutations ->
// (optional) brute force. De-duplicated across the non-brute phases.
function* candidates(opts) {
  const seen = new Set();
  const emit = function* (label, iter) {
    for (const cand of iter) {
      if (cand == null || cand === '') continue;
      if (seen.has(cand)) continue;
      seen.add(cand);
      // keep the de-dupe set bounded so huge wordlists don't exhaust memory
      if (seen.size > 5_000_000) seen.clear();
      yield { password: cand, source: label };
    }
  };

  const builtin = loadWordlistFiles([path.join(__dirname, 'wordlists', 'common-passwords.txt')]);
  yield* emit('builtin', builtin);

  if (opts.wordlists.length) yield* emit('wordlist', loadWordlistFiles(opts.wordlists));

  const seeds = ['fudgio', 'Fudgio', 'brownie', 'brownies', 'faaz', ...opts.names];
  yield* emit('mutation', mutations(seeds));

  if (opts.brute) {
    // brute force isn't de-duped against `seen` (the space is large and fresh)
    for (const cand of bruteForce(opts.charsetChars, opts.min, opts.max)) {
      yield { password: cand, source: 'brute' };
    }
  }
}

// ------------------------------------------------------------------- attempts
async function attempt(opts, password) {
  const url = opts.target.replace(/\/+$/, '') + opts.path;
  const body = { [opts.field]: password };
  if (opts.recaptchaToken) body[opts.recaptchaField] = opts.recaptchaToken;

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), opts.timeout);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ac.signal,
    });
    let text = '';
    try { text = await res.text(); } catch { /* ignore */ }
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { /* non-JSON body */ }
    return { status: res.status, json, text };
  } catch (err) {
    return { status: 0, error: err.name === 'AbortError' ? 'timeout' : err.message };
  } finally {
    clearTimeout(timer);
  }
}

// Classify a response so the assessment can reason about the endpoint's
// defences, not just success/failure.
function classify(r) {
  if (r.status === 0) return 'neterror';
  if (r.status === 200 && (!r.json || r.json.ok !== false)) return 'success';
  if (r.status === 401) return 'wrong';
  if (r.status === 429) return 'ratelimited';
  if (r.status === 403) return 'blocked';       // reCAPTCHA / WAF
  if (r.status === 400) return 'badrequest';    // e.g. "Verification expired"
  if (r.status >= 500) return 'servererror';
  return 'other';
}

// ------------------------------------------------------------------- main run
async function main() {
  const opts = parseArgs(process.argv);
  if (opts.help) { printHelp(); return; }

  if (!isLocalTarget(opts.target) && !opts.confirm) {
    console.error(red('\nRefusing to target a non-local host without authorization.'));
    console.error(`Target: ${opts.target}`);
    console.error('Only run this against systems you own or are explicitly authorized to test.');
    console.error(`Re-run with ${bold('--confirm')} to acknowledge you are authorized.\n`);
    process.exit(3);
  }

  if (!opts.quiet) {
    console.log(bold('\n🔐 Fudgio admin password-guessing bot ') + dim('(defensive audit)'));
    console.log(`   target      ${cyan(opts.target + opts.path)}`);
    console.log(`   field       ${opts.field}${opts.recaptchaToken ? dim('  (+ dummy reCAPTCHA token)') : ''}`);
    console.log(`   concurrency ${opts.concurrency}${opts.delay ? `   delay ${opts.delay}ms` : ''}`);
    if (opts.brute) console.log(`   brute       charset "${opts.charset}" (${opts.charsetChars.length} chars) len ${opts.min}..${opts.max}`);
    if (!isLocalTarget(opts.target)) console.log(yellow('   authorized  --confirm acknowledged'));
    console.log('');
  }

  const gen = candidates(opts);
  const stats = {
    attempts: 0, wrong: 0, ratelimited: 0, blocked: 0, badrequest: 0,
    servererror: 0, neterror: 0, other: 0,
  };
  const start = Date.now();
  let found = null;               // { password, source, attempt }
  let stop = false;
  let firstBadRequest = null;
  let lastProgress = 0;

  // Pull the next candidate atomically (generator.next() is synchronous).
  function nextCandidate() {
    if (stop) return null;
    if (opts.maxAttempts && stats.attempts >= opts.maxAttempts) return null;
    const n = gen.next();
    return n.done ? null : n.value;
  }

  function progress(force = false) {
    if (opts.quiet) return;
    const now = Date.now();
    if (!force && now - lastProgress < 250) return;
    lastProgress = now;
    const elapsed = (now - start) / 1000;
    const rate = elapsed > 0 ? Math.round(stats.attempts / elapsed) : 0;
    const extra = stats.ratelimited ? yellow(`  rate-limited×${stats.ratelimited}`) : '';
    const line = `   ${stats.attempts} tried   ${rate}/s${extra}`;
    if (isTTY) process.stdout.write('\r' + line.padEnd(60));
    else if (stats.attempts % 500 === 0) console.log(line.trim());
  }

  async function worker() {
    while (!stop) {
      const cand = nextCandidate();
      if (!cand) return;
      const r = await attempt(opts, cand.password);
      stats.attempts++;
      const kind = classify(r);

      if (kind === 'success') {
        if (!found) found = { ...cand, attempt: stats.attempts };
        if (opts.stopOnSuccess) { stop = true; }
        if (opts.verbose || !opts.quiet) {
          if (isTTY) process.stdout.write('\r' + ' '.repeat(60) + '\r');
          console.log(green(`   ✔ HIT  "${cand.password}"  `) + dim(`(#${stats.attempts}, ${cand.source})`));
        }
        if (opts.stopOnSuccess) return;
        continue;
      }

      if (kind === 'wrong') stats.wrong++;
      else if (kind === 'ratelimited') stats.ratelimited++;
      else if (kind === 'blocked') stats.blocked++;
      else if (kind === 'badrequest') { stats.badrequest++; if (!firstBadRequest) firstBadRequest = r; }
      else if (kind === 'servererror') stats.servererror++;
      else if (kind === 'neterror') stats.neterror++;
      else stats.other++;

      if (opts.verbose) {
        const tag = kind === 'wrong' ? dim('·') : yellow(kind);
        console.log(`   ${tag} ${cand.password} ${dim(`[${r.status}${r.error ? ' ' + r.error : ''}]`)}`);
      }
      progress();

      if (opts.delay) await new Promise((res) => setTimeout(res, opts.delay));
    }
  }

  // Bail out early if the very first request can't even reach the server.
  const probe = await attempt(opts, '__audit_probe__');
  if (probe.status === 0) {
    console.error(red(`\nCannot reach ${opts.target}${opts.path}: ${probe.error}`));
    console.error(dim('Is the admin server running?  npm run admin\n'));
    process.exit(4);
  }
  stats.attempts++;
  const probeKind = classify(probe);
  if (probeKind === 'wrong') stats.wrong++;
  else if (probeKind === 'badrequest') { stats.badrequest++; firstBadRequest = probe; }
  else if (probeKind === 'success') found = { password: '__audit_probe__', source: 'probe', attempt: 1 };

  const workers = Array.from({ length: opts.concurrency }, () => worker());
  await Promise.all(workers);

  const elapsed = Date.now() - start;
  if (isTTY && !opts.quiet) process.stdout.write('\r' + ' '.repeat(60) + '\r');

  report(opts, stats, found, elapsed);
  process.exit(found ? 0 : 1);
}

// --------------------------------------------------------------- final report
function report(opts, stats, found, elapsed) {
  const rate = elapsed > 0 ? Math.round(stats.attempts / (elapsed / 1000)) : 0;
  const bar = '─'.repeat(52);
  console.log('\n' + bar);
  console.log(bold(' Result'));
  console.log(bar);

  if (found) {
    console.log(green(' ✔ PASSWORD FOUND'));
    console.log(`   password : ${bold(found.password)}`);
    console.log(`   found on : attempt #${found.attempt} (${found.source})`);
  } else {
    console.log(red(' ✗ Password not found') + dim('  (within the candidates tried)'));
  }
  console.log(`   attempts : ${stats.attempts}`);
  console.log(`   elapsed  : ${fmtDuration(elapsed)}   (${rate} guesses/sec)`);

  const defences = [];
  if (stats.ratelimited) defences.push(`${stats.ratelimited}× HTTP 429 (rate limited)`);
  if (stats.blocked) defences.push(`${stats.blocked}× HTTP 403 (reCAPTCHA/WAF blocked)`);
  if (stats.badrequest) defences.push(`${stats.badrequest}× HTTP 400 (rejected — e.g. missing verification)`);
  if (stats.servererror) defences.push(`${stats.servererror}× HTTP 5xx`);
  if (stats.neterror) defences.push(`${stats.neterror}× network error/timeout`);
  if (defences.length) {
    console.log('   defences :');
    for (const d of defences) console.log(`              ${d}`);
  }

  // -------- assessment ------------------------------------------------------
  console.log('\n' + bar);
  console.log(bold(' Security assessment'));
  console.log(bar);

  const throttled = stats.ratelimited > 0;
  const captchaWorking = stats.blocked > 0 && stats.wrong === 0 && !found;

  if (found && found.source !== 'brute' && !throttled) {
    console.log(red(' ✗ HIGH RISK'));
    console.log('   The admin password was guessed from a wordlist/mutation list');
    console.log(`   in ${stats.attempts} tries at ${rate}/s with no throttling. An attacker`);
    console.log('   with a laptop could do the same.');
  } else if (found && found.source === 'brute') {
    console.log(red(' ✗ HIGH RISK'));
    console.log('   The password fell to brute force — it is short/low-entropy.');
  } else if (throttled) {
    console.log(yellow(' ⚠ PARTIAL PROTECTION'));
    console.log('   The endpoint rate-limited the bot — good — but that limit was');
    console.log('   client-observable. Confirm it is per-IP AND per-account and that');
    console.log('   it cannot be bypassed by rotating source IPs.');
  } else if (captchaWorking) {
    console.log(green(' ✓ reCAPTCHA/WAF is blocking automated attempts'));
    console.log('   Guesses were rejected before reaching the password check.');
    console.log('   Verify this holds with a real browser token, not just this bot.');
  } else if (!found) {
    console.log(green(' ✓ Not guessed from the candidates tried'));
    console.log('   The password survived this run. That is necessary but not');
    console.log('   sufficient — a bigger wordlist or longer brute force may still win.');
  }

  // Endpoint-hardening notes, driven by what we observed.
  const notes = [];
  if (!throttled && stats.wrong > 5) {
    notes.push('No rate limiting seen: ' + stats.wrong + ' wrong guesses were all answered with 401. '
      + 'Add per-IP + per-account throttling and exponential backoff/lockout on POST /api/login.');
  }
  if (opts.recaptchaToken && stats.wrong > 0 && stats.blocked === 0) {
    notes.push('reCAPTCHA did not stop a dummy token: server-side Enterprise verification is likely '
      + 'disabled (RECAPTCHA_PROJECT_ID / RECAPTCHA_API_KEY unset), so the site key alone provides no protection.');
  }
  if (found) {
    notes.push('Rotate ADMIN_TOKEN to a long, random value (e.g. `openssl rand -base64 24`) and never commit it. '
      + 'Prefer a hashed credential + real accounts over a single shared static token.');
  }
  if (notes.length) {
    console.log('\n' + bold(' Recommendations'));
    notes.forEach((n, i) => {
      console.log(`   ${i + 1}. ${n}`);
    });
  }
  console.log('');
}

main().catch((err) => {
  console.error(red('\nUnexpected error: ') + (err && err.stack ? err.stack : err));
  process.exit(10);
});
