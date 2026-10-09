/* Fudgio bandana print.

   One drawing, used everywhere a bandana appears: the shop grid, product
   pages, the hero, the bag, the admin, and the share image. It is plain SVG
   built from a colour and an ink, so a colour added in the admin gets the
   same print with no artwork needed. An uploaded photo replaces it.

   No ids, gradients or patterns — the dot field is a dashed line per row
   with round caps — so any number of these can sit on one page without
   clashing, and the markup is the same in the browser and in the build. */
(function (root) {
  var S = 200;

  function f(n) { return Math.round(n * 100) / 100; }

  /** The dot field: one dashed line per row, a dot at every dash. */
  function dots() {
    var d = '';
    for (var y = 20; y <= 180; y += 8) d += 'M20 ' + y + 'H180.01';
    return '<path d="' + d + '" stroke-width="1.5" stroke-dasharray="0 8" stroke-linecap="round" fill="none"/>';
  }

  /** A small leaf, pointing along `deg` from (cx, cy), `r` out. */
  function leaf(cx, cy, r, deg, len, wid) {
    var a = deg * Math.PI / 180;
    var x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
    return '<ellipse cx="' + f(x) + '" cy="' + f(y) + '" rx="' + len + '" ry="' + wid + '" transform="rotate(' + f(deg) + ' ' + f(x) + ' ' + f(y) + ')"/>';
  }

  /** The corner fan: three rings round the corner and a spray of leaves,
      kept clear of the border so nothing is cut through. */
  function corner(cx, cy, start) {
    var out = '';
    var at = '<circle fill="none" cx="' + cx + '" cy="' + cy + '" ';
    out += at + 'r="60" stroke-width="2.6"/>';
    out += at + 'r="67" stroke-width="1.6" stroke-dasharray="0 4.2" stroke-linecap="round"/>';
    out += at + 'r="74" stroke-width="2.6"/>';
    out += at + 'r="33" stroke-width="1.1"/>';
    var g = '';
    for (var i = 0; i < 3; i++) g += leaf(cx, cy, 46, start + 27 + i * 18, 6, 2.3);
    return out + '<g stroke="none">' + g + '</g>';
  }

  /** The centre medallion. Filled with the ground colour so dots stop at its edge. */
  function medallion(color) {
    var c = S / 2, g = '';
    for (var i = 0; i < 12; i++) g += leaf(c, c, 20.5, i * 30, 4.6, 1.9);
    return '<circle cx="100" cy="100" r="34" fill="' + color + '" stroke-width="1.7"/>'
      + '<circle cx="100" cy="100" r="29" fill="none" stroke-width="1.5" stroke-dasharray="0 3.6" stroke-linecap="round"/>'
      + '<g stroke="none">' + g + '</g>'
      + '<circle cx="100" cy="100" r="12" fill="none" stroke-width="1.5"/>'
      + '<circle cx="100" cy="100" r="5.5" stroke="none"/>'
      + '<circle cx="100" cy="100" r="2" fill="' + color + '" stroke="none"/>';
  }

  /** A diamond breaking the border at the middle of each side. */
  function diamonds(color) {
    var out = '', pts = [[100, 12.25], [187.75, 100], [100, 187.75], [12.25, 100]];
    pts.forEach(function (p) {
      var x = p[0], y = p[1];
      out += '<path d="M' + x + ' ' + (y - 5.2) + 'L' + (x + 5.2) + ' ' + y + 'L' + x + ' ' + (y + 5.2) + 'L' + (x - 5.2) + ' ' + y + 'Z" fill="' + color + '" stroke-width="1.4"/>'
        + '<circle cx="' + x + '" cy="' + y + '" r="1.5" stroke="none"/>';
    });
    return out;
  }

  /**
   * bandanaSVG('#C3201B', '#F3EDE0', {title: 'Classic Red bandana'})
   * Returns an <svg> string. `title` makes it an image with a name for screen
   * readers; without one it is decorative and hidden from them.
   */
  function bandanaSVG(color, ink, opts) {
    opts = opts || {};
    color = color || '#C3201B';
    ink = ink || '#F3EDE0';
    var label = opts.title
      ? ' role="img" aria-label="' + String(opts.title).replace(/[&<>"]/g, '') + '"'
      : ' aria-hidden="true" focusable="false"';
    return '<svg class="' + (opts.cls || 'bn-svg') + '" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg"' + label + '>'
      + '<rect width="200" height="200" fill="' + color + '"/>'
      + '<g fill="' + ink + '" stroke="' + ink + '">'
      + '<rect x="3.5" y="3.5" width="193" height="193" fill="none" stroke-width=".7" stroke-dasharray="2.4 1.8" opacity=".45"/>'
      + dots()
      + corner(0, 0, 0) + corner(200, 0, 90) + corner(200, 200, 180) + corner(0, 200, 270)
      + '<rect x="10" y="10" width="180" height="180" fill="none" stroke-width="1.7"/>'
      + '<rect x="14.5" y="14.5" width="171" height="171" fill="none" stroke-width="1.4" stroke-dasharray="0 3.4" stroke-linecap="round"/>'
      + diamonds(color)
      + medallion(color)
      + '</g>'
      // the folds a bandana keeps from the packet
      + '<path d="M100 0V200M0 100H200" stroke="#000" stroke-opacity=".16" stroke-width=".9"/>'
      + '<path d="M101 0V200M0 101H200" stroke="#fff" stroke-opacity=".08" stroke-width=".9"/>'
      + '</svg>';
  }

  root.bandanaSVG = bandanaSVG;
})(typeof globalThis !== 'undefined' ? globalThis : window);
