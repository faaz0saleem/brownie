/**
 * Studio shots of every bandana, rendered from the shop's own print.
 *
 *     node scripts/photos.mjs [slug ...] [--out dir] [--png]
 *
 * For each colour in api/catalog.php this writes three images to
 * assets/photos/:
 *
 *   <slug>-flat.webp     laid flat, cut out on a transparent background
 *   <slug>-fold.webp     folded into a triangle, cut out
 *   <slug>-detail.webp   a close-up of the cotton and print, square
 *
 * each at 1000px, plus a 480px "-sm" copy of every one for cards, the bag
 * and thumbnails.
 *
 * They are renders, not photographs: the print is drawn by assets/art.js and
 * the cloth — the weave, soft folds, the light across them and the shadow
 * under them — is SVG filter work, baked to WebP in headless Chromium. They
 * show the real design in the real colours, which is what a customer gets.
 * A photo uploaded in the admin replaces them everywhere on the site.
 */
import { spawn, execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const args = process.argv.slice(2);
const outI = args.indexOf('--out');
const OUT = outI >= 0 ? path.resolve(args[outI + 1]) : path.join(ROOT, 'assets/photos');
const PNG = args.includes('--png');
const only = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--out');
mkdirSync(OUT, { recursive: true });

const ctx = vm.createContext({});
vm.runInContext(readFileSync(path.join(ROOT, 'assets/art.js'), 'utf8'), ctx);
const inner = (c, i) => ctx.bandanaSVG(c, i).replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '');
const catalog = JSON.parse(execFileSync('php', ['-r', `require ${JSON.stringify(ROOT + '/api/catalog.php')}; echo json_encode(array_map(fn($b) => ['slug'=>$b['slug'],'color'=>$b['color'],'ink'=>$b['ink']], bandana_catalog()));`], { encoding: 'utf8' }));

/* ---------------- the cloth ----------------
   One filter does the fabric: a low-frequency noise field is the shape of
   the folds; it bends the print (displacement) and lights it (diffuse
   lighting, folded back in with soft-light so flat cloth keeps its colour).
   A fine noise and a warp-and-weft pattern give the cotton its grain. */
const clothFilter = (id, { seed = 4, freq = '0.0045 0.0065', bend = 30, relief = 7, grain = 0.22, weave = 0.16, weaveF = 0.55, shadow = 0 } = {}) => `
<filter id="${id}" x="-15%" y="-15%" width="130%" height="135%" color-interpolation-filters="sRGB">
  <feTurbulence type="fractalNoise" baseFrequency="${freq}" numOctaves="3" seed="${seed}" result="folds"/>
  <feTurbulence type="fractalNoise" baseFrequency="0.02 0.035" numOctaves="2" seed="${seed + 3}" result="creases"/>
  <feComposite in="folds" in2="creases" operator="arithmetic" k2=".8" k3=".25" result="height"/>
  <feDisplacementMap in="SourceGraphic" in2="folds" scale="${bend}" xChannelSelector="R" yChannelSelector="G" result="bent"/>
  <feDiffuseLighting in="height" surfaceScale="${relief}" diffuseConstant="1" lighting-color="#ffffff" result="lit">
    <feDistantLight azimuth="225" elevation="48"/>
  </feDiffuseLighting>
  <!-- flat cloth lights to ~0.74; map that to 0.5 so soft-light leaves its colour alone -->
  <feComponentTransfer in="lit" result="light"><feFuncR type="linear" slope="1.45" intercept="-.57"/><feFuncG type="linear" slope="1.45" intercept="-.57"/><feFuncB type="linear" slope="1.45" intercept="-.57"/></feComponentTransfer>
  <feBlend in="light" in2="bent" mode="soft-light" result="shaded"/>
  <feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="${seed + 9}" result="fib"/>
  <feColorMatrix in="fib" type="matrix" values="0 0 0 0 .5  0 0 0 0 .5  0 0 0 0 .5  0 0 0 ${grain} 0" result="fibA"/>
  <feBlend in="fibA" in2="shaded" mode="overlay" result="grained"/>
  <feTurbulence type="fractalNoise" baseFrequency="${weaveF} 0.012" numOctaves="1" seed="${seed + 11}" result="weft"/>
  <feTurbulence type="fractalNoise" baseFrequency="0.012 ${weaveF}" numOctaves="1" seed="${seed + 13}" result="warp"/>
  <feComposite in="weft" in2="warp" operator="arithmetic" k2=".5" k3=".5" result="ww"/>
  <feColorMatrix in="ww" type="matrix" values="0 0 0 0 .5  0 0 0 0 .5  0 0 0 0 .5  ${weave} ${weave} 0 0 0" result="wwA"/>
  <feBlend in="wwA" in2="grained" mode="multiply" result="woven"/>
  <feComposite in="woven" in2="bent" operator="in" result="final"/>
  ${shadow ? `<!-- the shadow is cast by the bent cloth, so it ripples with the edges -->
  <feGaussianBlur in="bent" stdDeviation="${shadow}" result="sb"/>
  <feOffset in="sb" dy="${Math.round(shadow * 1.25)}" result="so"/>
  <feColorMatrix in="so" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 .42 0" result="sh"/>
  <feGaussianBlur in="bent" stdDeviation="2.5" result="cb"/>
  <feOffset in="cb" dy="3" result="co"/>
  <feColorMatrix in="co" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 .35 0" result="contact"/>
  <feMerge><feMergeNode in="sh"/><feMergeNode in="contact"/><feMergeNode in="final"/></feMerge>` : ''}
</filter>`;
/* Laid flat: the print at 800px, slightly rotated, with folds and a shadow. */
function flat(c, i, seed) {
  const art = inner(c, i);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="1000" viewBox="0 0 1000 1000">
<defs>${clothFilter('cloth', { seed, shadow: 18 })}
  <clipPath id="sq"><rect width="200" height="200"/></clipPath></defs>
<g transform="rotate(-2.5 500 500)">
  <g filter="url(#cloth)"><g transform="translate(110 110) scale(3.9)" clip-path="url(#sq)">${art}</g></g>
</g></svg>`;
}

/* Folded corner to corner: a triangle, point down, with a crease along the
   top edge and the second layer of cloth just showing beneath it. */
function fold(c, i, seed) {
  const art = inner(c, i);
  // A 200-unit square rotated -135° about its centre and clipped to the
  // triangle (0,0)-(200,0)-(0,200) is the visible half of a diamond: its long
  // edge runs through the centre, point down. Scaled 3.04 that edge spans
  // x 70–930 at y 280 and the point lands at y 710.
  const tri = (dx, dy) => `<g transform="translate(${196 + dx} ${-24 + dy}) scale(3.04) rotate(-135 100 100)" clip-path="url(#tri)">${art}</g>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="1000" viewBox="0 0 1000 1000">
<defs>${clothFilter('cloth', { seed, bend: 16, relief: 5 })}${clothFilter('clothS', { seed, bend: 16, relief: 5, shadow: 20 })}
  <clipPath id="tri"><path d="M0 0H200L0 200Z"/></clipPath>
  <linearGradient id="crease" x1="0" y1="280" x2="0" y2="710" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="#fff" stop-opacity=".30"/><stop offset=".05" stop-color="#fff" stop-opacity="0"/>
    <stop offset=".7" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".2"/></linearGradient></defs>
<g filter="url(#clothS)" opacity=".92">${tri(-7, 11)}</g>
<g filter="url(#cloth)">${tri(0, 0)}</g>
<path d="M70 280H930L500 710Z" fill="url(#crease)"/>
</svg>`;
}

/* Close up: the medallion and dot field, big enough to see the cotton. */
function detail(c, i, seed) {
  const art = inner(c, i);
  const cloth = `<g filter="url(#cloth)"><g transform="translate(-1050 -1050) scale(15.5)">${art}</g></g>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="1000" viewBox="0 0 1000 1000">
<defs>${clothFilter('cloth', { seed, freq: '0.003 0.004', bend: 26, relief: 6, grain: 0.3, weave: 0.34, weaveF: 0.32 })}
  <radialGradient id="vig" cx=".5" cy=".5" r=".75"><stop offset=".6" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".28"/></radialGradient>
  <filter id="soft"><feGaussianBlur stdDeviation="2.6"/></filter>
  <radialGradient id="focus" cx=".5" cy=".55" r=".62"><stop offset=".55" stop-color="#fff"/><stop offset="1" stop-color="#000"/></radialGradient>
  <mask id="sharp"><rect width="1000" height="1000" fill="url(#focus)"/></mask></defs>
<rect width="1000" height="1000" fill="${c}"/>
<g filter="url(#soft)">${cloth}</g>
<g mask="url(#sharp)">${cloth}</g>
<rect width="1000" height="1000" fill="url(#vig)"/></svg>`;
}

/* ---------------- render in Chromium ---------------- */
const CHROME = process.env.CHROME_BIN || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const PORT = 9300 + Math.floor(Math.random() * 300);
const chrome = spawn(CHROME, ['--headless', '--no-sandbox', '--disable-gpu', '--hide-scrollbars', `--remote-debugging-port=${PORT}`, 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function targets() { for (let n = 0; n < 80; n++) { try { const j = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); if (j.length) return j; } catch {} await sleep(150); } throw new Error('Chromium did not start'); }
try {
  const page = (await targets()).find((t) => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0; const pending = new Map();
  ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
  await new Promise((r) => (ws.onopen = r));
  const send = (m, p = {}) => new Promise((res) => { const n = ++id; pending.set(n, res); ws.send(JSON.stringify({ id: n, method: m, params: p })); });
  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1000, height: 1000, deviceScaleFactor: 1, mobile: false });
  await send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } });
  await send('Page.navigate', { url: 'about:blank' }); await sleep(300);

  // Each scene is drawn once at 1000px and once at 480px; the small one is
  // the same picture, rasterised smaller rather than scaled down later.
  async function shootBoth(svg, base, opaque) {
    await shoot(svg, `${base}.webp`, 1000, opaque);
    await shoot(svg, `${base}-sm.webp`, 480, opaque);
  }
  async function shoot(svg, file, size, opaque) {
    const b64 = Buffer.from(svg).toString('base64');
    await send('Runtime.evaluate', { awaitPromise: true, expression: `new Promise(function(done){
      document.documentElement.style.background='transparent';
      document.body.style.cssText='margin:0;background:transparent';
      var img=new Image(); img.onload=function(){ setTimeout(done, 60); }; img.onerror=function(){ done(); };
      img.style.cssText='display:block;width:${size}px;height:${size}px';
      img.src='data:image/svg+xml;base64,${b64}';
      document.body.innerHTML=''; document.body.appendChild(img); })` });
    const fmt = PNG ? 'png' : 'webp';
    const shot = await send('Page.captureScreenshot', { format: fmt, quality: opaque ? 84 : 88, clip: { x: 0, y: 0, width: size, height: size, scale: 1 } });
    const out = path.join(OUT, file.replace(/\.webp$/, '.' + fmt));
    writeFileSync(out, Buffer.from(shot.result.data, 'base64'));
    return out;
  }

  let n = 0;
  for (const [k, p] of catalog.entries()) {
    if (only.length && !only.includes(p.slug)) continue;
    const seed = 3 + k * 7;
    await shootBoth(flat(p.color, p.ink, seed), `${p.slug}-flat`, false);
    await shootBoth(fold(p.color, p.ink, seed + 2), `${p.slug}-fold`, false);
    await shootBoth(detail(p.color, p.ink, seed + 4), `${p.slug}-detail`, true);
    n++; process.stdout.write(`${p.slug} `);
  }
  console.log(`\nrendered ${n} colour(s) to ${OUT}`);
  ws.close();
} finally { chrome.kill(); }
