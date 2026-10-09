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

  /* ---------------- people wearing it ----------------
     An illustrated portrait in the site's flat poster style, wearing the
     real print in the real colours. Three ways: tied on the head, knotted
     at the neck, or rolled into a headband. The print is laid on like the
     real thing — one big bandana, folded corner to corner, so the long
     fold runs through the medallion and the point is a corner of the print.
     Patterns need ids, so each call gets its own prefix. */
  var _pid = 0;
  function personSVG(o){
    o = o || {};
    var id = 'pp' + (++_pid) + (o.idSuffix || ''), style = o.style || 'head';
    var color = o.color || '#C3201B', ink = o.ink || '#F3EDE0';
    var skin = o.skin || '#B8805C', skinD = o.skinShade || '#9A6446', hair = o.hair || '#17110E';
    var shirt = o.shirt || '#141414', bg = o.bg || '#FF6A13', bg2 = o.bg2 || 'rgba(255,255,255,.12)';
    var print = bandanaSVG(color, ink).replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '');
    // one bandana of side `side`, its centre at (cx, cy), turned `turn` degrees
    var sheet = function(pid, side, cx, cy, turn){
      return '<pattern id="'+pid+'" width="'+side+'" height="'+side+'" patternUnits="userSpaceOnUse" patternTransform="translate('+cx+' '+cy+') rotate('+turn+') translate('+(-side/2)+' '+(-side/2)+')">'
        + '<rect width="'+side+'" height="'+side+'" fill="'+color+'"/><g transform="scale('+(side/200)+')">'+print+'</g></pattern>';
    };
    var defs = ''
      + (style === 'head' ? sheet(id+'p', 520, 500, 478, 45) + sheet(id+'q', 300, 700, 470, 20) : '')
      + (style === 'neck' ? sheet(id+'p', 300, 500, 905, 45) + sheet(id+'q', 260, 500, 880, 10) : '')
      + (style === 'band' ? sheet(id+'p', 220, 500, 470, 4) + sheet(id+'q', 220, 690, 440, 30) : '')
      + '<linearGradient id="'+id+'s" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".2"/><stop offset=".45" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".3"/></linearGradient>'
      + '<linearGradient id="'+id+'k" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity=".22"/><stop offset=".25" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".22"/></linearGradient>'
      + '<radialGradient id="'+id+'f" cx=".42" cy=".36" r=".72"><stop offset="0" stop-color="#fff" stop-opacity=".1"/><stop offset=".65" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".12"/></radialGradient>'
      + '<clipPath id="'+id+'a"><path d="M110 1200V430C110 230 285 90 500 90S890 230 890 430V1200Z"/></clipPath>';
    var cloth = function(d, pat, extra){ return '<path d="'+d+'" fill="url(#'+id+(pat||'p')+')"/><path d="'+d+'" fill="url(#'+id+'s)"/>' + (extra || ''); };
    var crease = function(d){ return '<path d="'+d+'" fill="none" stroke="#000" stroke-opacity=".22" stroke-width="6" stroke-linecap="round"/>'; };
    var out = '';
    out += '<g clip-path="url(#'+id+'a)"><rect width="1000" height="1200" fill="'+bg+'"/><circle cx="760" cy="300" r="300" fill="'+bg2+'"/>';
    // hair behind the head
    out += style === 'band'
      ? '<path d="M285 600C250 420 330 285 500 280C670 285 750 420 715 600C760 700 770 820 700 900L300 900C230 820 240 700 285 600Z" fill="'+hair+'"/>'
      : '<path d="M300 610C275 470 340 360 500 352C660 360 725 470 700 610C715 700 705 760 668 800L332 800C295 760 285 700 300 610Z" fill="'+hair+'"/>';
    // shoulders, t-shirt, neck
    out += '<path d="M120 1200C130 1030 230 945 395 915L605 915C770 945 870 1030 880 1200Z" fill="'+shirt+'"/>'
      + '<path d="M395 915Q500 990 605 915" fill="none" stroke="rgba(127,127,127,.25)" stroke-width="10"/>'
      + '<path d="M432 740H568L585 935Q500 985 415 935Z" fill="'+skin+'"/><path d="M432 740H568L572 800Q500 850 428 800Z" fill="'+skinD+'" opacity=".55"/>';
    // ears, head
    out += '<ellipse cx="330" cy="585" rx="30" ry="46" fill="'+skinD+'"/><ellipse cx="670" cy="585" rx="30" ry="46" fill="'+skinD+'"/>'
      + '<ellipse cx="500" cy="560" rx="172" ry="212" fill="'+skin+'"/><ellipse cx="500" cy="560" rx="172" ry="212" fill="url(#'+id+'f)"/>';
    // hair on top, where nothing covers it
    if(style === 'neck') out += '<path d="M326 540C312 390 400 334 500 332C600 334 688 390 674 540C650 470 600 420 520 418C440 420 380 450 350 520Z" fill="'+hair+'"/>'
      + '<path d="M520 418C590 424 640 460 662 520" fill="none" stroke="#fff" stroke-opacity=".08" stroke-width="10"/>';
    // face: nose, mouth, sunglasses
    out += '<path d="M497 560C488 605 478 640 492 652C503 658 516 655 522 648" fill="none" stroke="'+skinD+'" stroke-width="9" stroke-linecap="round"/>'
      + '<path d="M455 702Q500 720 545 702" fill="none" stroke="#7a3f2c" stroke-width="12" stroke-linecap="round"/>'
      + '<path d="M352 545H648" stroke="#0d0d0d" stroke-width="12"/>'
      + '<rect x="360" y="522" width="125" height="82" rx="34" fill="#0d0d0d"/><rect x="515" y="522" width="125" height="82" rx="34" fill="#0d0d0d"/>'
      + '<path d="M382 540L420 540" stroke="#fff" stroke-opacity=".35" stroke-width="8" stroke-linecap="round"/><path d="M537 540L575 540" stroke="#fff" stroke-opacity=".35" stroke-width="8" stroke-linecap="round"/>';
    if(style === 'head'){
      // tied on the head: the knot's two tails out to the side, then the cap
      out += cloth('M640 470L742 410L772 462L700 520Z', 'q') + cloth('M650 490L764 516L742 576L668 532Z', 'q')
        + '<circle cx="670" cy="492" r="26" fill="url(#'+id+'q)"/><circle cx="670" cy="492" r="26" fill="url(#'+id+'s)"/>';
      out += cloth('M322 512C312 365 400 312 500 310C600 312 688 365 678 512C620 482 562 470 500 470C438 470 380 482 322 512Z', 'p',
        crease('M420 330C450 380 470 420 478 466') + crease('M600 340C590 390 600 430 630 482') + crease('M372 380C400 410 410 450 400 488')
        + '<path d="M322 512C380 482 438 470 500 470C562 470 620 482 678 512" fill="none" stroke="#000" stroke-opacity=".3" stroke-width="10"/>'
        + '<path d="M332 497C386 470 440 460 500 460C560 460 614 470 668 497" fill="none" stroke="#fff" stroke-opacity=".22" stroke-width="5"/>');
    } else if(style === 'band'){
      // rolled into a headband, knotted above one ear
      out += cloth('M318 470C380 430 440 418 500 418C560 418 620 430 682 470L676 520C618 486 560 474 500 474C440 474 382 486 324 520Z', 'p',
        crease('M330 492C390 458 445 446 500 446C555 446 610 458 668 492')
        + '<path d="M318 470C380 430 440 418 500 418C560 418 620 430 682 470" fill="none" stroke="#fff" stroke-opacity=".22" stroke-width="6"/>');
      out += cloth('M676 455L760 400L782 436L700 492Z', 'q') + cloth('M680 480L770 500L760 545L690 515Z', 'q')
        + '<ellipse cx="684" cy="476" rx="26" ry="30" fill="url(#'+id+'q)"/><ellipse cx="684" cy="476" rx="26" ry="30" fill="url(#'+id+'s)"/>';
    } else if(style === 'neck'){
      // knotted at the neck: the triangle hangs, its point a corner of the print
      out += cloth('M290 905C380 925 440 930 500 930C560 930 620 925 710 905L500 1117Z', 'p',
        '<path d="M290 905L500 1117L710 905" fill="url(#'+id+'k)"/>' + crease('M420 935C440 990 470 1040 492 1090') + crease('M590 935C570 985 540 1035 510 1085'));
      out += cloth('M455 902L418 1004L452 1014L486 918Z', 'q') + cloth('M545 902L585 998L552 1010L516 918Z', 'q');
      out += cloth('M440 868C460 848 540 848 560 868C566 898 540 924 500 924C460 924 434 898 440 868Z', 'q');
    }
    var label = o.title ? ' role="img" aria-label="'+String(o.title).replace(/[&<>"]/g, '')+'"' : ' aria-hidden="true" focusable="false"';
    return '<svg class="'+(o.cls || 'person')+'" viewBox="0 0 1000 1200" xmlns="http://www.w3.org/2000/svg"'+label+'><defs>'+defs+'</defs>'+out+'</g></svg>';
  }

  root.bandanaSVG = bandanaSVG;
  root.personSVG = personSVG;
})(typeof globalThis !== 'undefined' ? globalThis : window);
