<?php
/**
 * Fudgio SEO builder.
 *
 * Owns the <title>, meta description, canonical URL, Open Graph / Twitter tags
 * and JSON-LD for every page, plus robots.txt and sitemap.xml. Keeping it in
 * one file means the tags can't drift apart page by page.
 *
 * Run after adding a page or changing copy:
 *
 *     php scripts/seo.php
 *
 * Everything it writes into a page sits between <!--SEO--> and <!--/SEO-->, so
 * re-running replaces the block rather than stacking duplicates.
 *
 * Only facts we can stand behind go in here. No invented ratings, review
 * counts, street address or opening hours — Google penalises structured data
 * that doesn't match the page, and none of that is true yet.
 */
declare(strict_types=1);

const SITE  = 'https://fudgio.com';
const BRAND = 'Fudgio';
const OG    = SITE . '/assets/og-image.png';

/** The catalog, mirroring assets/store.js. */
const BROWNIES = [
  [
    'file' => 'brownies/classic-chocolate.html',
    'url'  => '/brownies/classic-chocolate',
    'slug' => 'chocolate',
    'name' => 'Classic Chocolate Brownie',
    'short'=> 'Classic Chocolate',
    'from' => 190,
    'title'=> 'Classic Chocolate Brownie — Order Online in Lahore | Fudgio',
    'desc' => 'Order our Classic Chocolate brownie in Lahore — dense, gooey and deeply chocolatey with a crackly paper-thin top. Baked fresh to order from a secret small-batch recipe. From Rs 190, Cash on Delivery.',
    'body' => 'Dense, gooey and deeply chocolatey with a crackly, paper-thin top. Made from our secret small-batch recipe using premium dark chocolate and real butter.',
    'nuts' => false,
  ],
  [
    'file' => 'brownies/nutty-delight.html',
    'url'  => '/brownies/nutty-delight',
    'slug' => 'nutty-delight',
    'name' => 'Nutty Delight Brownie',
    'short'=> 'Nutty Delight',
    'from' => 220,
    'title'=> 'Nutty Delight Brownie with Walnuts & Hazelnuts | Fudgio Lahore',
    'desc' => 'Order our Nutty Delight brownie in Lahore — a rich chocolate brownie packed with roasted walnuts and hazelnuts. Contains nuts. Baked fresh to order. From Rs 220, Cash on Delivery.',
    'body' => 'A rich chocolate brownie packed with roasted walnuts and hazelnuts for a satisfying crunch in every bite. Contains tree nuts.',
    'nuts' => true,
  ],
  [
    'file' => 'brownies/salted-caramel.html',
    'url'  => '/brownies/salted-caramel',
    'slug' => 'salted-caramel',
    'name' => 'Salted Caramel Brownie',
    'short'=> 'Salted Caramel',
    'from' => 220,
    'title'=> 'Salted Caramel Brownie — Order Online in Lahore | Fudgio',
    'desc' => 'Order our Salted Caramel brownie in Lahore — golden salted caramel swirled through a fudgy chocolate brownie, finished with flaky sea salt. From Rs 220, Cash on Delivery.',
    'body' => 'Ribbons of golden salted caramel swirled through a fudgy chocolate brownie and finished with a pinch of flaky sea salt.',
    'nuts' => false,
  ],
];

/** Every page: canonical path, title, description, and whether search engines should index it. */
function pages(): array {
  $p = [
    'index.html' => [
      'url'   => '/',
      'title' => 'Fudgio — Handcrafted Fudgy Brownies Delivered in Lahore | Cash on Delivery',
      'desc'  => 'Fudgio bakes rich, gooey, handcrafted brownies fresh to order and delivers them across Lahore. Three signature flavours — Classic Chocolate, Nutty Delight and Salted Caramel. Cash on Delivery, from Rs 190.',
      'index' => true,
      'priority' => '1.0',
    ],
    'menu.html' => [
      'url'   => '/menu',
      'title' => 'Our Brownie Menu — 3 Signature Flavours | Fudgio Lahore',
      'desc'  => "Browse Fudgio's brownie menu: Classic Chocolate, Nutty Delight and Salted Caramel. Single brownies or boxes of 6 and 9, baked fresh to order and delivered across Lahore. Cash on Delivery.",
      'index' => true,
      'priority' => '0.9',
    ],
    'about.html' => [
      'url'   => '/about',
      'title' => 'About Fudgio — Small-Batch Brownies Baked in Lahore',
      'desc'  => 'The Fudgio story: a secret small-batch recipe, real butter, premium dark chocolate, and brownies baked fresh to order for delivery across Lahore.',
      'index' => true,
      'priority' => '0.6',
    ],
    'faq.html' => [
      'url'   => '/faq',
      'title' => 'FAQ — Delivery, Allergens & Cash on Delivery | Fudgio',
      'desc'  => 'Answers about Fudgio delivery in Lahore, Cash on Delivery, nut allergens, order tracking and the security check at checkout.',
      'index' => true,
      'priority' => '0.6',
    ],
    'contact.html' => [
      'url'   => '/contact',
      'title' => 'Contact Fudgio — Orders, Bulk Requests & Feedback',
      'desc'  => 'Get in touch with Fudgio about orders, bulk and corporate brownie requests, or feedback. We deliver across Lahore, Cash on Delivery only.',
      'index' => true,
      'priority' => '0.5',
    ],
    'gifting.html' => [
      'url'   => '/gifting',
      'title' => 'Brownie Gift Boxes Delivered in Lahore | Fudgio',
      'desc'  => 'Send a box of 6 or 9 handcrafted brownies to someone in Lahore. Plain gift packaging with no prices, a note in the box, and Cash on Delivery.',
      'index' => true,
      'priority' => '0.7',
    ],
    'bulk-orders.html' => [
      'url'   => '/bulk-orders',
      'title' => 'Bulk & Corporate Brownie Orders in Lahore | Fudgio',
      'desc'  => 'Brownies in bulk for offices, weddings, mehndis and events across Lahore. From 25 to 150+ pieces, mixed flavours, individually boxed on request. Cash on Delivery.',
      'index' => true,
      'priority' => '0.7',
    ],
    'delivery.html' => [
      'url'   => '/delivery',
      'title' => 'Brownie Delivery Areas & Charges in Lahore | Fudgio',
      'desc'  => 'Where Fudgio delivers in Lahore, how long it takes, and what delivery costs. Same-day on orders before 2pm, free delivery over Rs 2,500, Cash on Delivery.',
      'index' => true,
      'priority' => '0.6',
    ],
    'ingredients.html' => [
      'url'   => '/ingredients',
      'title' => 'Brownie Ingredients & Allergen Information | Fudgio',
      'desc'  => 'Full ingredients and allergens for every Fudgio brownie. Nutty Delight contains walnuts and hazelnuts; all brownies are baked in a kitchen that handles nuts, wheat, dairy, eggs and soy.',
      'index' => true,
      'priority' => '0.6',
    ],
    // Utility pages: useful to customers, not search results.
    'cart.html'     => ['url' => '/cart',     'title' => 'Your Cart | Fudgio',            'desc' => 'Review the brownies in your Fudgio cart before checking out.',                       'index' => false],
    'checkout.html' => ['url' => '/checkout', 'title' => 'Checkout | Fudgio',             'desc' => 'Enter your delivery details and place your Fudgio order. Cash on Delivery.',        'index' => false],
    'track.html'    => ['url' => '/track',    'title' => 'Track Your Order | Fudgio',     'desc' => 'Track your Fudgio brownie order with your tracking number and phone number.',      'index' => false],
    'product.html'  => ['url' => '/menu',     'title' => 'Our Brownies | Fudgio',         'desc' => 'Choose a Fudgio brownie, pick your box size and quantity.',                        'index' => false],
  ];
  foreach (BROWNIES as $b) {
    $p[$b['file']] = ['url' => $b['url'], 'title' => $b['title'], 'desc' => $b['desc'], 'index' => true, 'priority' => '0.8'];
  }
  return $p;
}

function e(string $s): string { return htmlspecialchars($s, ENT_QUOTES, 'UTF-8'); }
function jsonld(array $data): string {
  return '<script type="application/ld+json">'
       . json_encode($data, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) . '</script>';
}

/** Structured data for a given page. */
function schema_for(string $file): array {
  $org = [
    '@type' => 'Bakery',
    '@id'   => SITE . '/#business',
    'name'  => BRAND,
    'url'   => SITE,
    'logo'  => SITE . '/assets/icon-512.png',
    'image' => OG,
    'description' => 'Handcrafted small-batch brownies baked fresh to order and delivered across Lahore.',
    'email' => 'faaz.saleem@fudgio.com',
    'servesCuisine' => 'Desserts',
    'priceRange' => 'Rs 190 – Rs 1,490',
    'currenciesAccepted' => 'PKR',
    'paymentAccepted' => 'Cash on Delivery',
    'areaServed' => ['@type' => 'City', 'name' => 'Lahore', 'containedInPlace' => ['@type' => 'Country', 'name' => 'Pakistan']],
    'address' => ['@type' => 'PostalAddress', 'addressLocality' => 'Lahore', 'addressCountry' => 'PK'],
  ];

  if ($file === 'index.html') {
    return [
      $org,
      // Google reads this to decide what to print above the result instead of
      // the bare domain. It must sit on the home page and agree with
      // og:site_name and the <title>.
      ['@type' => 'WebSite', '@id' => SITE . '/#website', 'url' => SITE,
       'name' => BRAND, 'alternateName' => ['Fudgio Brownies', 'Fudgio Lahore'],
       'publisher' => ['@id' => SITE . '/#business'], 'inLanguage' => 'en'],
    ];
  }

  if ($file === 'menu.html') {
    $items = [];
    foreach (BROWNIES as $i => $b) {
      $items[] = ['@type' => 'ListItem', 'position' => $i + 1, 'name' => $b['name'], 'url' => SITE . $b['url']];
    }
    return [
      ['@type' => 'ItemList', 'name' => 'Fudgio brownie menu', 'itemListElement' => $items],
      breadcrumbs([['Home', '/'], ['Menu', '/menu']]),
    ];
  }

  foreach (BROWNIES as $b) {
    if ($b['file'] !== $file) continue;
    $product = [
      '@type' => 'Product',
      'name'  => $b['name'],
      'description' => $b['body'],
      'image' => OG,
      'url'   => SITE . $b['url'],
      'brand' => ['@type' => 'Brand', 'name' => BRAND],
      'category' => 'Brownies',
      'offers' => [
        '@type' => 'AggregateOffer',
        'priceCurrency' => 'PKR',
        'lowPrice' => (string) $b['from'],
        'availability' => 'https://schema.org/InStock',
        'seller' => ['@id' => SITE . '/#business'],
        'areaServed' => ['@type' => 'City', 'name' => 'Lahore'],
      ],
    ];
    if ($b['nuts']) {
      $product['hasAllergen'] = 'Tree nuts (walnut, hazelnut)';
      $product['suitableForDiet'] = [];
    }
    return [$product, breadcrumbs([['Home', '/'], ['Menu', '/menu'], [$b['short'], $b['url']]])];
  }

  if ($file === 'faq.html') return [faq_schema(), breadcrumbs([['Home', '/'], ['FAQ', '/faq']])];
  if ($file === 'about.html')   return [breadcrumbs([['Home', '/'], ['About', '/about']])];
  if ($file === 'contact.html') return [breadcrumbs([['Home', '/'], ['Contact', '/contact']])];
  return [];
}

function breadcrumbs(array $trail): array {
  $items = [];
  foreach ($trail as $i => [$name, $path]) {
    $items[] = ['@type' => 'ListItem', 'position' => $i + 1, 'name' => $name, 'item' => SITE . $path];
  }
  return ['@type' => 'BreadcrumbList', 'itemListElement' => $items];
}

/** Pulled from the real questions on faq.html — the markup must match the page. */
function faq_schema(): array {
  $qa = [
    ['Do you only accept Cash on Delivery?',
     'Yes. Fudgio accepts Cash on Delivery (COD) only. You pay in cash when your order is delivered — there are no online or card payments.'],
    ['How do I track my order?',
     'When you place an order you get a tracking number (like FUD-1001). Enter it with your phone number on the Track your order page to see the status.'],
    ['What is the security check at checkout?',
     'It is a short code shown as an image. Typing it in proves a person is placing the order rather than a script, which keeps automated bulk orders off the shop. If the characters are hard to read, use the refresh button next to the image for a different one.'],
    ['Do your brownies contain nuts?',
     'Our Nutty Delight contains walnuts and hazelnuts. If you have a nut allergy, please avoid it. All our brownies are made in a kitchen that also handles nuts, so traces may be present.'],
    ['Is delivery free?',
     'Delivery is free on orders over Rs 2,500. Below that, a small delivery fee applies. You will see the exact total before you confirm.'],
    ['How fresh are the brownies?',
     'We bake to order in small batches, so your brownies are as fresh as possible — usually baked the same day they are delivered.'],
    ['Where do you deliver?',
     'We currently deliver in Lahore only.'],
  ];
  $out = [];
  foreach ($qa as [$q, $a]) {
    $out[] = ['@type' => 'Question', 'name' => $q,
              'acceptedAnswer' => ['@type' => 'Answer', 'text' => $a]];
  }
  return ['@type' => 'FAQPage', 'mainEntity' => $out];
}

/** Build the block that goes into <head>. */
function head_block(string $file, array $meta): string {
  $canonical = SITE . ($meta['url'] === '/' ? '/' : $meta['url']);
  $robots = $meta['index'] ? 'index, follow, max-image-preview:large, max-snippet:-1' : 'noindex, follow';
  $type = str_starts_with($file, 'brownies/') ? 'product' : 'website';

  $out  = "<!--SEO--><!-- Generated by scripts/seo.php — edit that file, not this block. -->\n";
  $out .= '<title>' . e($meta['title']) . "</title>\n";
  $out .= '<meta name="description" content="' . e($meta['desc']) . "\"/>\n";
  $out .= '<link rel="canonical" href="' . e($canonical) . "\"/>\n";
  $out .= '<meta name="robots" content="' . $robots . "\"/>\n";
  $out .= "<meta name=\"author\" content=\"" . BRAND . "\"/>\n";
  $out .= "<meta name=\"geo.placename\" content=\"Lahore, Pakistan\"/>\n";
  // Icons. Reference only what exists: scripts/icons.php generates the sized
  // set from assets/logo-source.*, and until that is added we keep pointing at
  // the icons already in the repo rather than emitting links that 404.
  // favicon.ico sits at the site root because that is where Google looks for
  // the icon it shows beside a search result; it wants a square icon whose size
  // is a multiple of 48, which is why 48/96/192 are generated.
  $root = dirname(__DIR__);
  if (is_file("$root/favicon.ico")) $out .= "<link rel=\"icon\" href=\"/favicon.ico\" sizes=\"32x32\"/>\n";
  $any = false;
  foreach ([48, 96, 192] as $px) {
    if (!is_file("$root/assets/favicon-$px.png")) continue;
    $out .= "<link rel=\"icon\" type=\"image/png\" sizes=\"{$px}x{$px}\" href=\"/assets/favicon-$px.png\"/>\n";
    $any = true;
  }
  if (!$any) {
    if (is_file("$root/assets/favicon.svg")) $out .= "<link rel=\"icon\" type=\"image/svg+xml\" href=\"/assets/favicon.svg\"/>\n";
    if (is_file("$root/assets/favicon.png")) $out .= "<link rel=\"icon\" type=\"image/png\" href=\"/assets/favicon.png\"/>\n";
  }
  if (is_file("$root/assets/apple-touch-icon.png")) $out .= "<link rel=\"apple-touch-icon\" sizes=\"180x180\" href=\"/assets/apple-touch-icon.png\"/>\n";
  if (is_file("$root/site.webmanifest")) $out .= "<link rel=\"manifest\" href=\"/site.webmanifest\"/>\n";
  $out .= "<meta name=\"theme-color\" content=\"#ff6a13\"/>\n";
  // Open Graph — controls how the link looks on WhatsApp, Facebook, LinkedIn.
  $out .= '<meta property="og:type" content="' . $type . "\"/>\n";
  $out .= '<meta property="og:site_name" content="' . BRAND . "\"/>\n";
  $out .= '<meta property="og:title" content="' . e($meta['title']) . "\"/>\n";
  $out .= '<meta property="og:description" content="' . e($meta['desc']) . "\"/>\n";
  $out .= '<meta property="og:url" content="' . e($canonical) . "\"/>\n";
  $out .= '<meta property="og:image" content="' . OG . "\"/>\n";
  $out .= "<meta property=\"og:image:width\" content=\"1200\"/>\n";
  $out .= "<meta property=\"og:image:height\" content=\"630\"/>\n";
  $out .= '<meta property="og:image:alt" content="' . e(BRAND . ' — handcrafted brownies delivered in Lahore') . "\"/>\n";
  $out .= "<meta property=\"og:locale\" content=\"en_PK\"/>\n";
  // Twitter / X card.
  $out .= "<meta name=\"twitter:card\" content=\"summary_large_image\"/>\n";
  $out .= '<meta name="twitter:title" content="' . e($meta['title']) . "\"/>\n";
  $out .= '<meta name="twitter:description" content="' . e($meta['desc']) . "\"/>\n";
  $out .= '<meta name="twitter:image" content="' . OG . "\"/>\n";

  foreach (schema_for($file) as $s) {
    $out .= jsonld(['@context' => 'https://schema.org'] + $s) . "\n";
  }
  return $out . '<!--/SEO-->';
}

/* ---------------- write the head block into every page ---------------- */
$root = dirname(__DIR__);
$done = [];
foreach (pages() as $file => $meta) {
  $path = "$root/$file";
  if (!is_file($path)) { echo "skip (missing): $file\n"; continue; }
  $html = file_get_contents($path);
  $block = head_block($file, $meta);

  if (str_contains($html, '<!--SEO-->')) {
    $html = preg_replace('#<!--SEO-->.*?<!--/SEO-->#s', addcslashes($block, '\\$'), $html, 1);
  } else {
    // Drop the old title / description / robots tags, then insert after <head>.
    $html = preg_replace('#\s*<title>.*?</title>#s', '', $html, 1);
    $html = preg_replace('#\s*<meta name="description"[^>]*>#i', '', $html, 1);
    $html = preg_replace('#\s*<meta name="robots"[^>]*>#i', '', $html, 1);
    // Icons are managed here now — drop any hand-written ones so a stale
    // favicon.svg can't outrank the generated set in the browser's preference.
    $html = preg_replace('#\s*<link rel="(?:icon|alternate icon|apple-touch-icon|manifest)"[^>]*>#i', '', $html);
    $html = preg_replace('#\s*<meta name="theme-color"[^>]*>#i', '', $html);
    $html = preg_replace('#(<meta charset="UTF-8"\s*/?>)#i', "$1\n" . addcslashes($block, '\\$'), $html, 1);
  }
  // Anything this script owns must exist only inside the markers. Tags left
  // over from before (a hand-written favicon.svg, an old og: tag) would other-
  // wise sit alongside the generated ones and can win in the browser.
  $parts = preg_split('#(<!--SEO-->.*?<!--/SEO-->)#s', $html, -1, PREG_SPLIT_DELIM_CAPTURE);
  foreach ($parts as $i => $part) {
    if (str_starts_with($part, '<!--SEO-->')) continue;      // leave ours alone
    $part = preg_replace('#\s*<link rel="(?:icon|alternate icon|apple-touch-icon|manifest|canonical)"[^>]*>#i', '', $part);
    $part = preg_replace('#\s*<meta name="theme-color"[^>]*>#i', '', $part);
    $part = preg_replace('#\s*<meta (?:property="og:|name="twitter:)[^>]*>#i', '', $part);
    $parts[$i] = $part;
  }
  $html = implode('', $parts);

  file_put_contents($path, $html);
  $done[] = $file;
}
echo 'SEO block written to: ' . implode(', ', $done) . "\n";

/* ---------------- robots.txt ---------------- */
$robots = "# Fudgio — https://fudgio.com\nUser-agent: *\nAllow: /\n\n"
        . "# Nothing useful for search here\nDisallow: /cart\nDisallow: /checkout\nDisallow: /track\n"
        . "Disallow: /product\nDisallow: /api/\nDisallow: /admin/\n\n"
        . 'Sitemap: ' . SITE . "/sitemap.xml\n";
file_put_contents("$root/robots.txt", $robots);

/* ---------------- sitemap.xml ---------------- */
$today = date('Y-m-d');
$xml = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n"
     . "<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">\n";
foreach (pages() as $file => $meta) {
  if (empty($meta['index'])) continue;
  if (!is_file("$root/$file")) continue;
  $xml .= "  <url>\n    <loc>" . SITE . ($meta['url'] === '/' ? '/' : $meta['url']) . "</loc>\n"
        . "    <lastmod>$today</lastmod>\n"
        . '    <priority>' . ($meta['priority'] ?? '0.5') . "</priority>\n  </url>\n";
}
$xml .= "</urlset>\n";
file_put_contents("$root/sitemap.xml", $xml);
echo "wrote robots.txt and sitemap.xml\n";
