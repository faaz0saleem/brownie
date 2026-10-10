<?php
/**
 * Stamp a content hash onto every /assets/store.css and /assets/store.js
 * reference in the HTML.
 *
 * Why: the pages call functions defined in store.js. Without a version in the
 * URL a browser (or Hostinger's cache) can keep an old store.js while serving
 * new HTML, and the page breaks — that is exactly how the shop ended up
 * showing no brownies. Changing the query string makes it a different URL, so
 * a new deploy can never be served with the old file.
 *
 * Run this after ANY change to assets/store.css or assets/store.js:
 *
 *     php scripts/stamp-assets.php
 */
declare(strict_types=1);

$root = dirname(__DIR__);
$version = substr(hash('sha256',
    file_get_contents("$root/assets/store.css") .
    file_get_contents("$root/assets/store.js")), 0, 8);

$files = array_merge(glob("$root/*.html"), glob("$root/*/*.html"));
$changed = [];

foreach ($files as $file) {
  $html = file_get_contents($file);
  $before = $html;
  // Match the asset with or without an existing ?v=... and re-stamp it.
  $html = preg_replace(
    '#(href|src)="(/assets/store\.(?:css|js))(\?v=[a-f0-9]+)?"#',
    '$1="$2?v=' . $version . '"',
    $html
  );
  if ($html !== $before) { file_put_contents($file, $html); $changed[] = basename($file); }
}

echo "asset version: $version\n";
echo $changed ? 'stamped: ' . implode(', ', $changed) . "\n" : "nothing to change\n";
