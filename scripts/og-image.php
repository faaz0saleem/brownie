<?php
/**
 * Generates assets/og-image.png — the 1200x630 picture shown when someone
 * shares a fudgio.com link on WhatsApp, Facebook, X or LinkedIn.
 *
 *     php scripts/og-image.php
 */
declare(strict_types=1);

$W = 1200; $H = 630;
$im = imagecreatetruecolor($W, $H);
imageantialias($im, true);

$rgb = fn(int $r, int $g, int $b) => imagecolorallocate($im, $r, $g, $b);

// Warm caramel -> pink diagonal wash, matching the site's gradient.
for ($y = 0; $y < $H; $y++) {
  for ($x = 0; $x < $W; $x += 4) {
    $t = ($x / $W * 0.65) + ($y / $H * 0.35);
    $r = (int) (201 + (242 - 201) * $t);
    $g = (int) (118 + (85  - 118) * $t);
    $b = (int) (46  + (124 - 46)  * $t);
    imagefilledrectangle($im, $x, $y, $x + 3, $y, $rgb($r, $g, $b));
  }
}

// Soft light bloom, top-left.
for ($i = 340; $i > 0; $i -= 4) {
  $a = (int) (118 - ($i / 340) * 118);
  $c = imagecolorallocatealpha($im, 255, 226, 190, 127 - (int) ($a / 2.4));
  imagefilledellipse($im, 210, 120, $i * 2, $i * 2, $c);
}

// Cream card
$pad = 46; $r = 34;
// fully opaque: overlapping shapes with alpha would leave seams at the corners
$card = imagecolorallocate($im, 255, 250, 243);
$x1 = $pad; $y1 = $pad; $x2 = $W - $pad; $y2 = $H - $pad;
imagefilledrectangle($im, $x1 + $r, $y1, $x2 - $r, $y2, $card);
imagefilledrectangle($im, $x1, $y1 + $r, $x2, $y2 - $r, $card);
foreach ([[$x1 + $r, $y1 + $r], [$x2 - $r, $y1 + $r], [$x1 + $r, $y2 - $r], [$x2 - $r, $y2 - $r]] as [$cx, $cy]) {
  imagefilledellipse($im, $cx, $cy, $r * 2, $r * 2, $card);
}

$serif = '/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf';
$sans  = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf';
$sansB = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf';
foreach ([$serif, $sans, $sansB] as $f) {
  if (!is_file($f)) { fwrite(STDERR, "missing font: $f\n"); exit(1); }
}

$ink   = $rgb(46, 28, 18);
$brown = $rgb(168, 84, 19);
$muted = $rgb(122, 96, 76);
$line  = $rgb(238, 214, 186);

// Brand mark: rounded chocolate square with a grid of squares.
$bx = 108; $by = 150; $bs = 92;
$choc = $rgb(91, 58, 41);
imagefilledrectangle($im, $bx, $by, $bx + $bs, $by + $bs, $choc);
$dark = $rgb(64, 40, 28);
for ($i = 0; $i < 3; $i++) for ($j = 0; $j < 3; $j++) {
  $sx = $bx + 12 + $i * 24; $sy = $by + 12 + $j * 24;
  imagefilledrectangle($im, $sx, $sy, $sx + 18, $sy + 18, $dark);
}

imagettftext($im, 40, 0, $bx + 122, $by + 48, $ink,   $serif, 'Fudgio');
imagettftext($im, 15, 0, $bx + 124, $by + 82, $muted, $sansB, 'FRESH  ·  FUDGY  ·  COD');

imagettftext($im, 58, 0, 108, 350, $ink,   $serif, 'Handcrafted brownies,');
imagettftext($im, 58, 0, 108, 424, $brown, $serif, 'baked fresh to order.');

imagettftext($im, 22, 0, 108, 486, $muted, $sans, 'Delivered across Lahore  ·  Cash on Delivery');

imageline($im, 108, 520, $W - 108, 520, $line);

$chips = ['Classic Chocolate', 'Nutty Delight', 'Salted Caramel'];
$x = 108;
$last = count($chips) - 1;
foreach ($chips as $i => $chip) {
  $box = imagettfbbox(18, 0, $sansB, $chip);
  imagettftext($im, 18, 0, $x, 566, $brown, $sansB, $chip);
  $x += ($box[2] - $box[0]) + 16;
  if ($i !== $last) { imagettftext($im, 18, 0, $x, 566, $line, $sansB, '•'); $x += 24; }
}

imagettftext($im, 20, 0, $W - 108 - 118, 566, $muted, $sansB, 'fudgio.com');

imagepng($im, __DIR__ . '/../assets/og-image.png', 8);
imagedestroy($im);
echo "wrote assets/og-image.png (1200x630)\n";
