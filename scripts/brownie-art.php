<?php
/**
 * Draws the default brownie artwork: assets/brownie-<flavour>.svg
 *
 *     php scripts/brownie-art.php
 *
 * These are illustrations, not photographs — deliberately. A real photo of a
 * real Fudgio brownie is what sells, and it belongs in the admin under
 * Products & Stock → Photo. Whatever is uploaded there replaces this
 * automatically everywhere on the shop. Until then the site shows drawn
 * brownies rather than an emoji, and nothing pretends to be a photo of a
 * product that hasn't been photographed.
 */
declare(strict_types=1);

$out = dirname(__DIR__) . '/assets';

/** Deterministic pseudo-random so the art is identical on every run. */
function rnd(int $seed, int $i, float $lo, float $hi): float {
  $h = fmod(sin(($seed * 127.1) + ($i * 311.7)) * 43758.5453, 1.0);
  if ($h < 0) $h += 1.0;
  return $lo + $h * ($hi - $lo);
}

/**
 * @param string $slug    output name
 * @param array  $body    [top, bottom] chocolate colours
 * @param array  $crust   [light, dark] crackly-top colours
 * @param string $extras  flavour-specific SVG drawn on top of the brownie
 * @param array  $back    [inner, outer] backdrop colours
 */
function brownie(string $slug, array $body, array $crust, string $extras, array $back, int $seed): string {
  [$c1, $c2]  = $body;
  [$k1, $k2]  = $crust;
  [$b1, $b2]  = $back;
  $id = str_replace('-', '', $slug);

  // Crumbs scattered on the surface behind and in front of the brownie.
  $crumbs = '';
  for ($i = 0; $i < 14; $i++) {
    $x = rnd($seed, $i, 24, 456);
    $y = rnd($seed, $i + 40, 26, 300);
    // keep them out of the middle, where the brownie sits
    if ($x > 120 && $x < 360 && $y > 70 && $y < 250) { $x = $x < 240 ? $x - 105 : $x + 105; }
    $r  = rnd($seed, $i + 80, 2.2, 5.6);
    $op = rnd($seed, $i + 120, 0.25, 0.6);
    $rot = rnd($seed, $i + 160, 0, 360);
    $crumbs .= sprintf(
      '<rect x="%.1f" y="%.1f" width="%.1f" height="%.1f" rx="1.6" fill="#4a2a1c" opacity="%.2f" transform="rotate(%.1f %.1f %.1f)"/>',
      $x, $y, $r * 2, $r * 1.5, $op, $rot, $x, $y);
  }

  // Mottled patches that read as a crackly, paper-thin top.
  $patches = '';
  for ($i = 0; $i < 11; $i++) {
    $cx = rnd($seed, $i + 200, 168, 312);
    $cy = rnd($seed, $i + 240, 104, 200);
    $rx = rnd($seed, $i + 280, 12, 34);
    $ry = rnd($seed, $i + 320, 7, 17);
    $op = rnd($seed, $i + 360, 0.10, 0.30);
    $patches .= sprintf('<ellipse cx="%.1f" cy="%.1f" rx="%.1f" ry="%.1f" fill="%s" opacity="%.2f"/>',
      $cx, $cy, $rx, $ry, $k1, $op);
  }

  return <<<SVG
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 330" width="480" height="330" role="img">
  <defs>
    <radialGradient id="bg$id" cx="38%" cy="26%" r="88%">
      <stop offset="0" stop-color="$b1"/><stop offset="1" stop-color="$b2"/>
    </radialGradient>
    <linearGradient id="top$id" x1="0" y1="0" x2="0.35" y2="1">
      <stop offset="0" stop-color="$c1"/><stop offset="1" stop-color="$c2"/>
    </linearGradient>
    <linearGradient id="side$id" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="$k2"/><stop offset="1" stop-color="#2a170e"/>
    </linearGradient>
    <filter id="sh$id" x="-30%" y="-30%" width="160%" height="170%">
      <feDropShadow dx="0" dy="10" stdDeviation="12" flood-color="#0b0a0a" flood-opacity="0.30"/>
    </filter>
  </defs>

  <rect width="480" height="330" fill="url(#bg$id)"/>
  $crumbs

  <g filter="url(#sh$id)" transform="rotate(-4 240 165)">
    <!-- the depth of the slice -->
    <path d="M150 196 h180 a10 10 0 0 1 10 10 v26 a14 14 0 0 1 -14 14 h-172 a14 14 0 0 1 -14 -14 v-26 a10 10 0 0 1 10 -10 z" fill="url(#side$id)"/>
    <!-- the top -->
    <rect x="140" y="92" width="200" height="112" rx="12" fill="url(#top$id)"/>
    <g clip-path="inset(0 round 12px)">
      <rect x="140" y="92" width="200" height="112" rx="12" fill="none"/>
      $patches
    </g>
    <!-- crackly sheen along the top edge -->
    <path d="M150 104 q46 -9 92 -3 t88 5" stroke="$k1" stroke-width="3" fill="none" opacity="0.5" stroke-linecap="round"/>
    <path d="M158 122 q40 -7 78 -2" stroke="$k1" stroke-width="2" fill="none" opacity="0.32" stroke-linecap="round"/>
    $extras
  </g>
</svg>
SVG;
}

/* --- Classic Chocolate: dark, glossy, crackly top --- */
file_put_contents("$out/brownie-chocolate.svg", brownie(
  'chocolate',
  ['#6b402b', '#3b2216'],
  ['#a9764f', '#4a2a1c'],
  '<ellipse cx="196" cy="118" rx="26" ry="11" fill="#c08a5c" opacity="0.22"/>',
  ['#fff2e8', '#ffc49b'],
  7
));

/* --- Nutty Delight: walnut and hazelnut pieces on top --- */
$nuts = '';
foreach ([[178,124,13,9,-18],[228,110,15,10,12],[276,132,12,8,34],[206,158,14,9,-6],[300,164,11,8,22],[252,150,10,7,-30]] as $i => [$x,$y,$rx,$ry,$rot]) {
  $nuts .= sprintf(
    '<g transform="rotate(%d %d %d)"><ellipse cx="%d" cy="%d" rx="%d" ry="%d" fill="#c9975f"/>'
    . '<ellipse cx="%d" cy="%d" rx="%d" ry="%d" fill="#a97844" opacity="0.85"/>'
    . '<path d="M%d %d q%d -%d %d 0" stroke="#8a5f34" stroke-width="1.6" fill="none" opacity="0.8"/></g>',
    $rot, $x, $y, $x, $y, $rx, $ry, $x, $y + 1, (int)($rx * 0.7), (int)($ry * 0.62),
    $x - $rx + 2, $y, (int)($rx * 0.9), (int)($ry * 0.7), ($rx - 2) * 2);
}
file_put_contents("$out/brownie-nutty.svg", brownie(
  'nutty', ['#70472e', '#3f2617'], ['#b98554', '#4f2f1e'], $nuts, ['#fff1e4', '#ffbb90'], 19
));

/* --- Salted Caramel: golden swirl and flakes of sea salt --- */
$caramel =
  ''
  . '<path d="M156 152 q36 -28 76 -9 t78 -7" stroke="#e8a54e" stroke-width="11" fill="none" stroke-linecap="round" opacity="0.95"/>'
  . '<path d="M156 152 q36 -28 76 -9 t78 -7" stroke="#f7c877" stroke-width="5" fill="none" stroke-linecap="round" opacity="0.9"/>'
  . '<path d="M168 178 q40 -18 80 -4" stroke="#e8a54e" stroke-width="7" fill="none" stroke-linecap="round" opacity="0.7"/>';
foreach ([[186,132],[232,124],[286,140],[210,168],[300,120],[258,178]] as [$x,$y]) {
  $caramel .= sprintf('<rect x="%d" y="%d" width="4" height="4" rx="1" fill="#fffaf3" opacity="0.92"/>', $x, $y);
}
file_put_contents("$out/brownie-caramel.svg", brownie(
  'caramel', ['#6d4224', '#3d2314'], ['#c08b4e', '#4c2c1a'], $caramel, ['#fff0f5', '#ffb3d1'], 31
));

echo "wrote assets/brownie-chocolate.svg, brownie-nutty.svg, brownie-caramel.svg\n";
