<?php
/**
 * Draws the hero banner: assets/hero-banner.svg
 *
 *     php scripts/banner.php
 *
 * The hero slot is square (see `.hero-art` in assets/store.css), so this is
 * drawn 1000x1000 and cropped with object-fit. It is an illustration, not a
 * photograph — same rule as the product art in brownie-art.php. Nothing here
 * pretends to be a picture of a real brownie.
 *
 * Composition is a flat-lay: a black tray of nine freshly cut squares, shot
 * from above on the brand's orange -> pink field. Nine is deliberate — it is
 * the largest box we sell, so the hero shows exactly what turns up.
 *
 * The field is orange -> pink; the brownies stay chocolate-brown, because a
 * brownie drawn in pink stops reading as food.
 */
declare(strict_types=1);

$out = dirname(__DIR__) . '/assets';

/** Deterministic pseudo-random so the banner is byte-identical on every run. */
function brnd(int $seed, int $i, float $lo, float $hi): float {
  $h = fmod(sin(($seed * 91.3) + ($i * 271.9)) * 43758.5453, 1.0);
  if ($h < 0) $h += 1.0;
  return $lo + $h * ($hi - $lo);
}

/**
 * One brownie square seen from directly above: a fudgy body with a mottled,
 * crackly top and a slightly darker cut edge.
 */
function square(float $x, float $y, float $s, int $seed): string {
  // Fine, low-contrast mottling. Big pale blobs read as grease spots rather
  // than a baked crust, so these stay small and barely-there.
  $patches = '';
  for ($i = 0; $i < 16; $i++) {
    $cx = brnd($seed, $i,      $x + 16, $x + $s - 16);
    $cy = brnd($seed, $i + 30, $y + 16, $y + $s - 16);
    $rx = brnd($seed, $i + 60, 3.5, 11);
    $ry = brnd($seed, $i + 90, 2.5, 7);
    $op = brnd($seed, $i + 120, 0.05, 0.15);
    $rot= brnd($seed, $i + 150, 0, 180);
    $patches .= sprintf('<ellipse cx="%.1f" cy="%.1f" rx="%.1f" ry="%.1f" fill="#e0b183" opacity="%.2f" transform="rotate(%.1f %.1f %.1f)"/>',
      $cx, $cy, $rx, $ry, $op, $rot, $cx, $cy);
  }
  // Two short hairline crackles. At the size this actually renders on the
  // page each square is ~50px, so anything more turns into visual noise.
  $crack = '';
  for ($i = 0; $i < 2; $i++) {
    $cy  = brnd($seed, $i + 400, $y + 30, $y + $s - 30);
    $x0  = brnd($seed, $i + 430, $x + 20, $x + 40);
    $len = brnd($seed, $i + 460, $s * 0.32, $s * 0.52);
    $dip = brnd($seed, $i + 490, -5, 5);
    $op  = brnd($seed, $i + 520, 0.10, 0.18);
    $crack .= sprintf('<path d="M%.1f %.1f q%.1f %.1f %.1f 0" stroke="#e8c096" stroke-width="1.4" fill="none" opacity="%.2f" stroke-linecap="round"/>',
      $x0, $cy, $len / 2, $dip, $len, $op);
  }

  return sprintf(
      '<g><rect x="%.1f" y="%.1f" width="%.1f" height="%.1f" rx="13" fill="url(#cut)"/>'
    . '<g clip-path="inset(0 round 13px)">%s</g>%s'
    . '<rect x="%.1f" y="%.1f" width="%.1f" height="%.1f" rx="13" fill="none" stroke="#20120b" stroke-width="2.5" opacity="0.55"/></g>',
    $x, $y, $s, $s, $patches, $crack, $x, $y, $s, $s);
}

/* ---- the nine squares, in a 3x3 grid inside the tray ---- */
$grid = '';
$gx = 306; $gy = 306; $sq = 122; $gap = 14;
for ($r = 0; $r < 3; $r++) {
  for ($c = 0; $c < 3; $c++) {
    $grid .= square($gx + $c * ($sq + $gap), $gy + $r * ($sq + $gap), $sq, 7 + $r * 3 + $c);
  }
}

/* ---- crumbs scattered on the field around the tray ---- */
$crumbs = '';
for ($i = 0; $i < 30; $i++) {
  $cx = brnd(5, $i,       50, 950);
  $cy = brnd(5, $i + 50,  50, 950);
  // keep the tray footprint clear
  if ($cx > 250 && $cx < 750 && $cy > 250 && $cy < 750) {
    $cx = $cx < 500 ? $cx - 205 : $cx + 205;
  }
  $r   = brnd(5, $i + 100, 3.5, 10);
  $op  = brnd(5, $i + 150, 0.22, 0.55);
  $rot = brnd(5, $i + 200, 0, 360);
  $crumbs .= sprintf('<rect x="%.1f" y="%.1f" width="%.1f" height="%.1f" rx="2" fill="#4a2a1c" opacity="%.2f" transform="rotate(%.1f %.1f %.1f)"/>',
    $cx, $cy, $r * 2, $r * 1.4, $op, $rot, $cx, $cy);
}

/* ---- four-point sparkles ---- */
$sparks = '';
foreach ([[152,186,26],[856,232,20],[792,806,24],[196,806,18],[906,540,15],[104,486,17]] as [$sx,$sy,$sr]) {
  $k = $sr * 0.20;   // waist of the star
  $sparks .= sprintf(
      '<path d="M%1$.1f %2$.1f Q%3$.1f %4$.1f %5$.1f %6$.1f Q%3$.1f %7$.1f %1$.1f %8$.1f Q%9$.1f %7$.1f %10$.1f %6$.1f Q%9$.1f %4$.1f %1$.1f %2$.1f z" fill="#ffffff" opacity="0.9"/>',
    $sx, $sy - $sr,           // top
    $sx + $k, $sy - $k,       // control (upper right)
    $sx + $sr, $sy,           // right
    $sy + $k,                 // control y (lower)
    $sy + $sr,                // bottom
    $sx - $k,                 // control x (left)
    $sx - $sr);               // left
}

$svg = <<<SVG
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000" width="1000" height="1000" role="img" aria-label="A tray of nine freshly cut Fudgio brownies seen from above">
  <defs>
    <linearGradient id="field" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#ff6a13"/>
      <stop offset="1" stop-color="#ff2e88"/>
    </linearGradient>
    <radialGradient id="glow" cx="26%" cy="18%" r="58%">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.30"/>
      <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="tray" x1="0" y1="0" x2="0.4" y2="1">
      <stop offset="0" stop-color="#17100c"/><stop offset="1" stop-color="#0b0a0a"/>
    </linearGradient>
    <linearGradient id="cut" x1="0" y1="0" x2="0.35" y2="1">
      <stop offset="0" stop-color="#6b402b"/><stop offset="1" stop-color="#3b2216"/>
    </linearGradient>
    <filter id="trayShadow" x="-25%" y="-25%" width="150%" height="150%">
      <feDropShadow dx="0" dy="24" stdDeviation="28" flood-color="#0b0a0a" flood-opacity="0.38"/>
    </filter>
  </defs>

  <!-- the brand field -->
  <rect width="1000" height="1000" fill="url(#field)"/>
  <rect width="1000" height="1000" fill="url(#glow)"/>

  <!-- soft white bokeh -->
  <circle cx="852" cy="138" r="112" fill="#ffffff" opacity="0.12"/>
  <circle cx="118" cy="852" r="146" fill="#ffffff" opacity="0.10"/>
  <circle cx="922" cy="884" r="80"  fill="#ffffff" opacity="0.11"/>

  $crumbs

  <!-- the tray, tipped a few degrees so it feels placed rather than pasted -->
  <g filter="url(#trayShadow)" transform="rotate(-4 500 500)">
    <rect x="272" y="272" width="456" height="456" rx="34" fill="url(#tray)"/>
    <rect x="286" y="286" width="428" height="428" rx="26" fill="none" stroke="#ffffff" stroke-width="2" opacity="0.10"/>
    $grid
  </g>

  $sparks
</svg>
SVG;

file_put_contents("$out/hero-banner.svg", $svg);
echo "wrote assets/hero-banner.svg\n";
