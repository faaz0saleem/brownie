/**
 * Draws the brand marks from the shop's own bandana print (assets/art.js):
 *
 *   assets/logo.svg, assets/favicon.svg   the orange bandana mark
 *   <out>/logo-source.svg                 full-bleed square, for scripts/icons.php
 *   <out>/og-image.svg                    1200×630 link preview
 *
 *     node scripts/brand-art.mjs [outDir]
 *     node scripts/render-png.mjs <outDir>/logo-source.svg assets/logo-source.png 512 512
 *     node scripts/render-png.mjs <outDir>/og-image.svg assets/og-image.png 1200 630
 *     php scripts/icons.php
 *
 * Set FONT_DIR to a folder holding archivo.woff2 and dmmono.woff2 (both SIL
 * Open Font License, from Google Fonts) to embed the site's type in the
 * preview; without it the preview falls back to Helvetica/Arial.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT = path.resolve(process.argv[2] || path.join(ROOT, 'assets'));
mkdirSync(OUT, { recursive: true });
const ctx = vm.createContext({});
vm.runInContext(readFileSync(path.join(ROOT, 'assets/art.js'), 'utf8'), ctx);
const inner = (c, i) => ctx.bandanaSVG(c, i).replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '');
// A nested <svg> clips the print to its square, as it is in the shop.
const sym = (c, i, x, y, size, rot) =>
  `<g transform="rotate(${rot} ${x + size / 2} ${y + size / 2})"><svg x="${x}" y="${y}" width="${size}" height="${size}" viewBox="0 0 200 200">${inner(c, i)}</svg></g>`;

// The mark: one orange bandana, white print.
const mark = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">${inner('#FF6A13', '#FFFFFF')}</svg>\n`;
writeFileSync(path.join(ROOT, 'assets/logo.svg'), mark);
writeFileSync(path.join(ROOT, 'assets/favicon.svg'), mark);
writeFileSync(path.join(OUT, 'logo-source.svg'), mark);

// Link preview.
let fontCss = '', sans = "Helvetica, Arial, sans-serif", mono = "Menlo, monospace";
const fd = process.env.FONT_DIR;
if (fd && existsSync(path.join(fd, 'archivo.woff2'))) {
  const b64 = (f) => readFileSync(path.join(fd, f)).toString('base64');
  fontCss = `<style>@font-face{font-family:A;font-weight:100 900;src:url(data:font/woff2;base64,${b64('archivo.woff2')}) format('woff2')}`
    + `@font-face{font-family:M;src:url(data:font/woff2;base64,${b64('dmmono.woff2')}) format('woff2')}</style>`;
  sans = 'A'; mono = 'M';
}
const shadow = `<filter id="sh" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="22" stdDeviation="18" flood-color="#000" flood-opacity=".55"/></filter>`;
const og = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">${fontCss}<defs>${shadow}</defs>
<rect width="1200" height="630" fill="#0D0D0D"/>
<text x="72" y="96" font-family="${sans}" font-weight="800" font-size="34" letter-spacing="-.5" fill="#F4F1EC">FUDGIO</text>
<text x="72" y="150" font-family="${mono}" font-size="17" letter-spacing="2.5" fill="#A8A39A">PRINTED BANDANAS / 8 COLOURS</text>
<g font-family="${sans}" font-weight="800" font-size="82" letter-spacing="-3" fill="#F4F1EC">
  <text x="68" y="262">The bandana</text><text x="68" y="350">that finishes</text><text x="68" y="438">the fit.</text></g>
<rect x="72" y="486" width="292" height="62" rx="31" fill="#FF6A13"/>
<text x="218" y="526" text-anchor="middle" font-family="${sans}" font-weight="600" font-size="23" fill="#fff">Shop all 8 colours</text>
<text x="392" y="525" font-family="${mono}" font-size="19" fill="#C9C5BD">fudgio.com</text>
<g filter="url(#sh)">${sym('#1D2B5C', '#EFECE6', 905, 70, 230, 8)}</g>
<g filter="url(#sh)">${sym('#D9A21B', '#141414', 700, 330, 210, -7)}</g>
<g filter="url(#sh)">${sym('#C3201B', '#F3EDE0', 760, 130, 330, -3)}</g>
<circle cx="1070" cy="500" r="74" fill="#FF2E88"/>
<text x="1070" y="505" text-anchor="middle" font-family="${sans}" font-weight="800" font-size="44" letter-spacing="-2" fill="#fff">15%</text>
<text x="1070" y="536" text-anchor="middle" font-family="${mono}" font-size="15" letter-spacing="2" fill="#fff">OFF ANY 3</text>
</svg>\n`;
writeFileSync(path.join(OUT, 'og-image.svg'), og);
console.log('wrote logo.svg, favicon.svg,', path.join(OUT, 'logo-source.svg'), 'and', path.join(OUT, 'og-image.svg'));
