<?php
/**
 * Builds every icon the site needs from one source image.
 *
 *   1. Put the logo at  assets/logo-source.png   (or .jpg / .jpeg / .webp)
 *   2. Run:  php scripts/icons.php
 *
 * Produces:
 *   favicon.ico                  16+32+48 px, at the site root where Google looks
 *   assets/favicon-16/32/48/96/192/512.png
 *   assets/favicon.png           32 px, the plain fallback
 *   assets/apple-touch-icon.png  180 px, square on the logo's own background
 *   assets/icon-512.png          512 px, for the web app manifest
 *
 * The favicons are cropped to a circle with a transparent surround, which is
 * how the brand mark is meant to read. The Apple icon is deliberately left
 * square on a solid background: iOS applies its own rounded mask, and any
 * transparency there turns black on the home screen.
 *
 * Google shows a favicon beside the search result. It wants a square icon
 * whose size is a multiple of 48, reachable by Googlebot, and consistent
 * across the site — hence the 48/96/192 sizes and the root favicon.ico.
 */
declare(strict_types=1);

$root = dirname(__DIR__);

/* ---------------- find the source ---------------- */
$source = null;
foreach (['png', 'jpg', 'jpeg', 'webp'] as $ext) {
  $try = "$root/assets/logo-source.$ext";
  if (is_file($try)) { $source = $try; break; }
}
if (!$source) {
  fwrite(STDERR,
    "No source logo found.\n\n" .
    "Save the logo as assets/logo-source.png (or .jpg/.jpeg/.webp) and run this again.\n" .
    "Square works best; anything else is centre-cropped to a square first.\n");
  exit(1);
}

$data = file_get_contents($source);
$src  = @imagecreatefromstring($data);
if (!$src) { fwrite(STDERR, "Could not read $source — is it a valid image?\n"); exit(1); }
imagepalettetotruecolor($src);
$sw = imagesx($src); $sh = imagesy($src);
echo 'source: ' . basename($source) . " ({$sw}x{$sh})\n";

/* ---------------- centre-crop to a square ---------------- */
$side = min($sw, $sh);
$sq = imagecreatetruecolor($side, $side);
imagealphablending($sq, false); imagesavealpha($sq, true);
imagecopyresampled($sq, $src, 0, 0, (int)(($sw - $side) / 2), (int)(($sh - $side) / 2),
                   $side, $side, $side, $side);

/** The logo's own background colour, sampled from a corner — used behind the
 *  Apple icon so it never renders on black. */
$bg = imagecolorsforindex($sq, imagecolorat($sq, 2, 2));

/** Scale to $size, then keep only what falls inside a circle. */
function circle_icon($sq, int $size) {
  $side = imagesx($sq);
  $out = imagecreatetruecolor($size, $size);
  imagealphablending($out, false);
  imagesavealpha($out, true);
  imagefilledrectangle($out, 0, 0, $size, $size, imagecolorallocatealpha($out, 0, 0, 0, 127));

  // Render at 4x and average down, so the circle's edge is smooth at 16px.
  $ss = $size * 4;
  $big = imagecreatetruecolor($ss, $ss);
  imagealphablending($big, false); imagesavealpha($big, true);
  imagecopyresampled($big, $sq, 0, 0, 0, 0, $ss, $ss, $side, $side);

  $r = $ss / 2; $cx = $r; $cy = $r;
  for ($y = 0; $y < $ss; $y++) {
    for ($x = 0; $x < $ss; $x++) {
      if ((($x + 0.5) - $cx) ** 2 + (($y + 0.5) - $cy) ** 2 > $r * $r) {
        imagesetpixel($big, $x, $y, imagecolorallocatealpha($big, 0, 0, 0, 127));
      }
    }
  }
  imagealphablending($out, false);
  imagecopyresampled($out, $big, 0, 0, 0, 0, $size, $size, $ss, $ss);
  imagedestroy($big);
  return $out;
}

/** Square icon on a solid background (Apple home screen). */
function square_icon($sq, int $size, array $bg) {
  $out = imagecreatetruecolor($size, $size);
  imagealphablending($out, true); imagesavealpha($out, true);
  imagefilledrectangle($out, 0, 0, $size, $size,
    imagecolorallocate($out, $bg['red'], $bg['green'], $bg['blue']));
  imagecopyresampled($out, $sq, 0, 0, 0, 0, $size, $size, imagesx($sq), imagesx($sq));
  return $out;
}

/* ---------------- write the PNGs ---------------- */
$made = [];
foreach ([16, 32, 48, 96, 192, 512] as $size) {
  $im = circle_icon($sq, $size);
  imagepng($im, "$root/assets/favicon-$size.png", 9);
  imagedestroy($im);
  $made[] = "favicon-$size.png";
}
copy("$root/assets/favicon-32.png", "$root/assets/favicon.png");
copy("$root/assets/favicon-512.png", "$root/assets/icon-512.png");

$apple = square_icon($sq, 180, $bg);
imagepng($apple, "$root/assets/apple-touch-icon.png", 9);
imagedestroy($apple);

/* ---------------- favicon.ico (16 + 32 + 48, PNG-compressed) ----------------
   ICO is a small container: a 6-byte header, one 16-byte directory entry per
   image, then the image payloads. Every browser in use accepts PNG inside it. */
$pngs = [];
foreach ([16, 32, 48] as $size) $pngs[$size] = file_get_contents("$root/assets/favicon-$size.png");

$ico = pack('vvv', 0, 1, count($pngs));         // reserved, type=icon, count
$offset = 6 + 16 * count($pngs);
$dir = ''; $body = '';
foreach ($pngs as $size => $png) {
  $dir .= pack('CCCCvvVV',
    $size === 256 ? 0 : $size,   // width  (0 means 256)
    $size === 256 ? 0 : $size,   // height
    0, 0,                         // palette size, reserved
    1, 32,                        // colour planes, bits per pixel
    strlen($png), $offset);
  $body .= $png;
  $offset += strlen($png);
}
file_put_contents("$root/favicon.ico", $ico . $dir . $body);

/* ---------------- web app manifest ---------------- */
file_put_contents("$root/site.webmanifest", json_encode([
  'name'             => 'Fudgio',
  'short_name'       => 'Fudgio',
  'description'      => 'Handcrafted brownies baked fresh to order and delivered across Lahore.',
  'start_url'        => '/',
  'display'          => 'standalone',
  'background_color' => sprintf('#%02x%02x%02x', $bg['red'], $bg['green'], $bg['blue']),
  'theme_color'      => sprintf('#%02x%02x%02x', $bg['red'], $bg['green'], $bg['blue']),
  'icons'            => [
    ['src' => '/assets/favicon-192.png', 'sizes' => '192x192', 'type' => 'image/png'],
    ['src' => '/assets/icon-512.png',    'sizes' => '512x512', 'type' => 'image/png'],
    ['src' => '/assets/icon-512.png',    'sizes' => '512x512', 'type' => 'image/png', 'purpose' => 'maskable'],
  ],
], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) . "\n");

imagedestroy($sq); imagedestroy($src);

echo 'wrote: ' . implode(', ', $made) . ", favicon.png, icon-512.png, apple-touch-icon.png\n";
echo "wrote: favicon.ico (16+32+48), site.webmanifest\n";
echo sprintf("background sampled from the logo: #%02x%02x%02x\n", $bg['red'], $bg['green'], $bg['blue']);
