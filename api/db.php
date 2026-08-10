<?php
// Fudgio data layer (PHP + PDO). Connects to MySQL (your Google Cloud SQL /
// Hostinger MySQL) when DB_HOST is set in .env, otherwise falls back to a local
// SQLite file so the app still runs for development. Mirrors the Node schema.
declare(strict_types=1);
require_once __DIR__ . '/mailer.php';

/* ---------------- .env loader ----------------------------------------------
   Two files, read in order:

     .env        committed, deploys with the site, MUST hold no passwords.
     .env.local  server only, git-ignored, never deployed — put secrets here.

   .env.local wins. It exists because .env is tracked: a password written into
   .env is published to the repository, and every git deploy overwrites .env on
   the server anyway. .env.local is untouched by deploys.                     */
function env_read_file(string $file, array $env): array {
  if (!is_file($file)) return $env;
  foreach (file($file, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
    $line = trim($line);
    if ($line === '' || $line[0] === '#') continue;
    $eq = strpos($line, '=');
    if ($eq === false) continue;
    $k = trim(substr($line, 0, $eq));
    $v = trim(substr($line, $eq + 1));
    if ((str_starts_with($v, '"') && str_ends_with($v, '"')) ||
        (str_starts_with($v, "'") && str_ends_with($v, "'"))) $v = substr($v, 1, -1);
    if ($v !== '') $env[$k] = $v;      // a blank line never wipes a real value
    elseif (!array_key_exists($k, $env)) $env[$k] = '';
  }
  return $env;
}
function env_all(): array {
  static $env = null;
  if ($env !== null) return $env;
  $env = env_read_file(__DIR__ . '/../.env', []);
  $env = env_read_file(__DIR__ . '/../.env.local', $env);
  // Real environment variables win over both files.
  foreach ($env as $k => $_) { $r = getenv($k); if ($r !== false) $env[$k] = $r; }
  return $env;
}
function env(string $k, $default = null) {
  $e = env_all();
  if (array_key_exists($k, $e) && $e[$k] !== '') return $e[$k];
  $r = getenv($k);
  return ($r !== false && $r !== '') ? $r : $default;
}

/* ---------------- config ---------------- */
function cfg(): array {
  return [
    'currency'        => env('CURRENCY', 'Rs'),
    'freeDeliveryOver'=> (int) env('FREE_DELIVERY_OVER', '2500'),
    'deliveryFee'     => (int) env('DELIVERY_FEE', '150'),
    'adminToken'      => env('ADMIN_TOKEN', 'Faaz12345'),
    'brandName'       => env('BRAND_NAME', 'Fudgio'),
    'adminDomain'     => env('ADMIN_DOMAIN', 'admin.fudgio.com'),
    'siteUrl'         => env('SITE_URL', 'https://fudgio.com'),
  ];
}

/* ---------------- PDO connection ---------------- */
function db_driver(): string {
  db();
  return $GLOBALS['__fudgio_driver'];
}
function db(): PDO {
  static $pdo = null;
  if ($pdo) return $pdo;
  $host = env('DB_HOST');
  if ($host) {
    $port = env('DB_PORT', '3306');
    $name = env('DB_NAME', 'fudgio');
    $user = env('DB_USER', 'root');
    $pass = env('DB_PASSWORD', '');
    $dsn  = "mysql:host=$host;port=$port;dbname=$name;charset=utf8mb4";
    $opts = [
      PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
      PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
      PDO::ATTR_TIMEOUT            => 10,
    ];
    if (env('DB_SSL') === 'true') {
      // Cloud SQL public IP requires SSL. We connect over TLS without pinning a
      // CA cert (server-side encryption); set DB_SSL_CA to a CA path to verify.
      $ca = env('DB_SSL_CA');
      if ($ca) $opts[PDO::MYSQL_ATTR_SSL_CA] = $ca;
      if (defined('PDO::MYSQL_ATTR_SSL_VERIFY_SERVER_CERT'))
        $opts[PDO::MYSQL_ATTR_SSL_VERIFY_SERVER_CERT] = false;
    }
    $pdo = new PDO($dsn, $user, $pass, $opts);
    $GLOBALS['__fudgio_driver'] = 'mysql';
  } else {
    // Store the SQLite file OUTSIDE the web root by default so a git redeploy
    // (which replaces public_html) can't wipe your orders. Override with
    // DB_SQLITE_PATH in .env if you want a specific location.
    $sqlitePath = env('DB_SQLITE_PATH');
    if (!$sqlitePath) {
      $candidates = [dirname(__DIR__, 2) . '/fudgio-data', __DIR__ . '/../data'];
      $dir = null;
      foreach ($candidates as $c) { if (@is_dir($c) || @mkdir($c, 0775, true)) { $dir = $c; break; } }
      $dir = $dir ?: sys_get_temp_dir();
      $sqlitePath = $dir . '/fudgio.sqlite';
    }
    $pdo = new PDO('sqlite:' . $sqlitePath);
    $GLOBALS['__fudgio_sqlite'] = $sqlitePath;
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
    $GLOBALS['__fudgio_driver'] = 'sqlite';
  }
  db_init($pdo, $GLOBALS['__fudgio_driver']);
  return $pdo;
}

/* ---------------- schema + seed ---------------- */
function db_init(PDO $pdo, string $driver): void {
  $bigimg = $driver === 'mysql' ? 'LONGTEXT' : 'TEXT';
  $pdo->exec("CREATE TABLE IF NOT EXISTS products (
    id VARCHAR(40) PRIMARY KEY, slug VARCHAR(120), name VARCHAR(160), tagline VARCHAR(255),
    description TEXT, price INT, gradient VARCHAR(255), emoji VARCHAR(16), image_url $bigimg,
    flavors TEXT, sizes TEXT, allergens TEXT, contains_nuts INT DEFAULT 0,
    stock INT DEFAULT 0, sold INT DEFAULT 0, featured INT DEFAULT 0, active INT DEFAULT 1,
    sort_order INT DEFAULT 0, created_at BIGINT)");
  $pdo->exec("CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(40) PRIMARY KEY, name VARCHAR(160), email VARCHAR(191), phone VARCHAR(40),
    password_hash VARCHAR(255), google_id VARCHAR(64), avatar_url TEXT,
    city VARCHAR(120), address TEXT, order_count INT DEFAULT 0, total_spent INT DEFAULT 0,
    created_at BIGINT, last_order_at BIGINT, last_login_at BIGINT)");
  $pdo->exec("CREATE TABLE IF NOT EXISTS orders (
    id VARCHAR(40) PRIMARY KEY, user_id VARCHAR(40), items TEXT, customer TEXT,
    subtotal INT, delivery_fee INT, total INT, payment_method VARCHAR(20),
    status VARCHAR(40), status_history TEXT, created_at BIGINT)");
  $pdo->exec("CREATE TABLE IF NOT EXISTS visits (
    id VARCHAR(40) PRIMARY KEY, visitor VARCHAR(40), page VARCHAR(191), ip VARCHAR(64),
    referrer VARCHAR(255), ua VARCHAR(255), created_at BIGINT)");
  $pdo->exec("CREATE TABLE IF NOT EXISTS email_otp (
    email VARCHAR(191) PRIMARY KEY, code_hash VARCHAR(255), expires_at BIGINT,
    attempts INT DEFAULT 0, sends INT DEFAULT 0, last_sent BIGINT,
    verified_at BIGINT, created_at BIGINT)");
  $pdo->exec("CREATE TABLE IF NOT EXISTS rate_hits (
    id VARCHAR(40) PRIMARY KEY, bucket VARCHAR(80), ip VARCHAR(64), created_at BIGINT)");
  $pdo->exec("CREATE TABLE IF NOT EXISTS counters (name VARCHAR(40) PRIMARY KEY, value BIGINT)");
  $pdo->exec("INSERT " . ($driver === 'mysql' ? 'IGNORE ' : 'OR IGNORE ') .
             "INTO counters (name, value) VALUES ('orderSeq', 1000)");

  $count = (int) $pdo->query("SELECT COUNT(*) AS c FROM products")->fetch()['c'];
  if ($count === 0) db_seed($pdo);

  db_migrate($pdo);
}

/**
 * Brings existing rows up to date with the current catalogue shape. Runs on
 * every request, so it must be cheap and must converge: once a row matches,
 * no UPDATE is issued and the whole thing is three SELECTed rows.
 *
 * Prices the admin has set are never overwritten — the migration only drops
 * sizes we no longer sell and fills in ones that are missing.
 */
function db_migrate(PDO $pdo): void {
  // Every brownie is sold exactly three ways, in this order.
  $WANT = [
    ['key' => 'single', 'label' => 'Single brownie', 'pieces' => 1],
    ['key' => '6',      'label' => 'Box of 6',       'pieces' => 6],
    ['key' => '9',      'label' => 'Box of 9',       'pieces' => 9],
  ];
  // Ratios taken from the seed prices, used only to invent a price for a size
  // that does not exist yet. Anything already priced keeps its price.
  $FROM_SIX = ['single' => 0.211, '6' => 1.0, '9' => 1.433];

  /** Which of the three a stored label refers to, or null if we no longer sell it. */
  $classify = function (string $label): ?string {
    $l = strtolower($label);
    if (strpos($l, 'single') !== false || strpos($l, '1 ') === 0) return 'single';
    if (strpos($l, '6') !== false) return '6';
    if (strpos($l, '9') !== false) return '9';
    return null;
  };

  // The palette moved from browns to the brand's black/orange/pink. Only the
  // known old values are replaced, so a gradient set in the admin survives.
  $GRADIENTS = [
    'chocolate'      => 'linear-gradient(135deg,#0b0a0a,#ff6a13)',
    'nutty-delight'  => 'linear-gradient(135deg,#ff6a13,#ff2e88)',
    'salted-caramel' => 'linear-gradient(135deg,#ff2e88,#0b0a0a)',
  ];
  $OLD_GRADIENTS = [
    'linear-gradient(135deg,#5b3a29,#2b1a12)', 'linear-gradient(135deg, #5b3a29 0%, #2b1a12 100%)',
    'linear-gradient(135deg,#6d4c2f,#3a2417)', 'linear-gradient(135deg, #6d4c2f 0%, #3a2417 100%)',
    'linear-gradient(135deg,#a06a34,#3b230f)', 'linear-gradient(135deg, #a06a34 0%, #3b230f 100%)',
  ];

  try {
    $rows = $pdo->query("SELECT id, slug, sizes, price, gradient FROM products")->fetchAll();
    $updSizes = $pdo->prepare("UPDATE products SET sizes=? WHERE id=?");
    $updGrad  = $pdo->prepare("UPDATE products SET gradient=? WHERE id=?");

    foreach ($rows as $r) {
      /* ---- sizes: exactly the three we sell ---- */
      $current = json_decode($r['sizes'] ?? '[]', true) ?: [];
      $priced  = [];
      foreach ($current as $s) {
        $key = $classify((string)($s['label'] ?? ''));
        if ($key !== null && !isset($priced[$key])) $priced[$key] = (int)($s['price'] ?? 0);
      }

      // Work out a per-box-of-6 baseline to derive anything still missing.
      $six = $priced['6']
          ?? (isset($priced['single']) ? (int) round($priced['single'] / $FROM_SIX['single'])
          :  (isset($priced['9'])      ? (int) round($priced['9']      / $FROM_SIX['9'])
          :  max(1, (int)($r['price'] ?? 900))));

      $next = [];
      foreach ($WANT as $w) {
        $price = $priced[$w['key']] ?? (int) (round($six * $FROM_SIX[$w['key']] / 10) * 10);
        $next[] = ['label' => $w['label'], 'pieces' => $w['pieces'], 'price' => max(1, $price)];
      }
      // Only write when something actually changed, so this settles to a no-op.
      if (json_encode($next) !== json_encode($current)) $updSizes->execute([json_encode($next), $r['id']]);

      /* ---- gradient: retire the old brown pairs ---- */
      $grad = trim((string)($r['gradient'] ?? ''));
      if (isset($GRADIENTS[$r['slug']]) && ($grad === '' || in_array($grad, $OLD_GRADIENTS, true))) {
        $updGrad->execute([$GRADIENTS[$r['slug']], $r['id']]);
      }
    }
  } catch (Throwable $e) { /* non-fatal: never block a page load on a migration */ }
}

function db_seed(PDO $pdo): void {
  $now = now_ms();
  $catalog = [
    ['chocolate', 'Classic Chocolate', 'The original, impossibly fudgy',
     'Dense, gooey and deeply chocolatey with a crackly, paper-thin top. Made from our secret small-batch recipe using premium dark chocolate and real butter.',
     900, 'linear-gradient(135deg,#0b0a0a,#ff6a13)', '🍫',
     [['label'=>'Single brownie','pieces'=>1,'price'=>190],['label'=>'Box of 6','pieces'=>6,'price'=>900],['label'=>'Box of 9','pieces'=>9,'price'=>1290]],
     ['Gluten (wheat)','Dairy','Eggs','Soy'], 0, 60, 0],
    ['nutty-delight', 'Nutty Delight', 'Loaded with toasted nuts',
     'A rich chocolate brownie packed with roasted walnuts and hazelnuts for a satisfying crunch in every bite. Made from our secret small-batch recipe.',
     1050, 'linear-gradient(135deg,#ff6a13,#ff2e88)', '🌰',
     [['label'=>'Single brownie','pieces'=>1,'price'=>220],['label'=>'Box of 6','pieces'=>6,'price'=>1050],['label'=>'Box of 9','pieces'=>9,'price'=>1490]],
     ['Tree nuts (walnut, hazelnut)','Gluten (wheat)','Dairy','Eggs','Soy'], 1, 45, 1],
    ['salted-caramel', 'Salted Caramel', 'Sweet, salty, unforgettable',
     'Ribbons of golden salted caramel swirled through a fudgy chocolate brownie and finished with a pinch of flaky sea salt. Made from our secret small-batch recipe.',
     1050, 'linear-gradient(135deg,#ff2e88,#0b0a0a)', '🍯',
     [['label'=>'Single brownie','pieces'=>1,'price'=>220],['label'=>'Box of 6','pieces'=>6,'price'=>1050],['label'=>'Box of 9','pieces'=>9,'price'=>1490]],
     ['Gluten (wheat)','Dairy','Eggs','Soy'], 0, 50, 2],
  ];
  $st = $pdo->prepare("INSERT INTO products
    (id, slug, name, tagline, description, price, gradient, emoji, image_url,
     flavors, sizes, allergens, contains_nuts, stock, sold, featured, active, sort_order, created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)");
  foreach ($catalog as $c) {
    [$slug,$name,$tag,$desc,$price,$grad,$emoji,$sizes,$allergens,$nuts,$stock,$sort] = $c;
    $st->execute([gen_id(), $slug, $name, $tag, $desc, $price, $grad, $emoji, null,
      json_encode([$name]), json_encode($sizes), json_encode($allergens), $nuts,
      $stock, 0, 1, 1, $sort, $now]);
  }
}

/* ---------------- helpers ---------------- */
function now_ms(): int { return (int) round(microtime(true) * 1000); }
function gen_id(): string { return base_convert((string) time(), 10, 36) . bin2hex(random_bytes(4)); }
function jdec($s, $d = []) { if ($s === null || $s === '') return $d; $v = json_decode($s, true); return $v === null ? $d : $v; }

function map_product(array $r): array {
  return [
    'id'=>$r['id'],'slug'=>$r['slug'],'name'=>$r['name'],'tagline'=>$r['tagline'],
    'description'=>$r['description'],'price'=>(int)$r['price'],'gradient'=>$r['gradient'],
    'emoji'=>$r['emoji'],'imageUrl'=>$r['image_url'],'flavors'=>jdec($r['flavors']),
    'sizes'=>jdec($r['sizes']),'allergens'=>jdec($r['allergens']),
    'containsNuts'=>(bool)$r['contains_nuts'],'stock'=>(int)$r['stock'],'sold'=>(int)$r['sold'],
    'featured'=>(bool)$r['featured'],'active'=>(bool)$r['active'],'sort'=>(int)$r['sort_order'],
    'createdAt'=>(int)$r['created_at'],
  ];
}
function map_order(array $r): array {
  return [
    'id'=>$r['id'],'userId'=>$r['user_id'],'items'=>jdec($r['items']),'customer'=>jdec($r['customer'], (object)[]),
    'subtotal'=>(int)$r['subtotal'],'deliveryFee'=>(int)$r['delivery_fee'],'total'=>(int)$r['total'],
    'paymentMethod'=>$r['payment_method'],'status'=>$r['status'],'statusHistory'=>jdec($r['status_history']),
    'createdAt'=>(int)$r['created_at'],
  ];
}
function map_user(array $r): array {
  return [
    'id'=>$r['id'],'name'=>$r['name'],'email'=>$r['email'],'phone'=>$r['phone'],
    'avatarUrl'=>$r['avatar_url'],'city'=>$r['city'],'address'=>$r['address'],
    'orders'=>(int)$r['order_count'],'totalSpent'=>(int)$r['total_spent'],
    'createdAt'=>(int)$r['created_at'],
    'lastOrderAt'=>$r['last_order_at']!==null?(int)$r['last_order_at']:null,
  ];
}

/* ---------------- products ---------------- */
function products_all(bool $includeInactive = false): array {
  $sql = "SELECT * FROM products " . ($includeInactive ? '' : 'WHERE active=1') . " ORDER BY featured DESC, sort_order ASC";
  return array_map('map_product', db()->query($sql)->fetchAll());
}
function product_get(string $idOrSlug, bool $includeInactive = false): ?array {
  $st = db()->prepare("SELECT * FROM products WHERE (id=? OR slug=?) " . ($includeInactive ? '' : 'AND active=1') . " LIMIT 1");
  $st->execute([$idOrSlug, $idOrSlug]);
  $r = $st->fetch();
  return $r ? map_product($r) : null;
}
function product_update(string $id, array $patch): ?array {
  $cur = product_get($id, true);
  if (!$cur) return null;
  $m = array_merge($cur, $patch);
  $st = db()->prepare("UPDATE products SET slug=?, name=?, tagline=?, description=?, price=?, gradient=?, emoji=?,
    image_url=?, flavors=?, sizes=?, allergens=?, contains_nuts=?, stock=?, sold=?, featured=?, active=?, sort_order=? WHERE id=?");
  $st->execute([$m['slug'],$m['name'],$m['tagline'],$m['description'],(int)$m['price'],$m['gradient'],$m['emoji'],
    $m['imageUrl'] ?? null, json_encode($m['flavors']), json_encode($m['sizes']), json_encode($m['allergens']),
    !empty($m['containsNuts'])?1:0, (int)$m['stock'], (int)$m['sold'], !empty($m['featured'])?1:0,
    !empty($m['active'])?1:0, (int)($m['sort'] ?? 0), $id]);
  return product_get($id, true);
}
function product_create(array $d): array {
  $id = gen_id();
  $slug = $d['slug'] ?? strtolower(preg_replace('/[^a-z0-9]+/i', '-', trim($d['name'] ?? 'brownie')));
  $slug = trim($slug, '-') ?: 'brownie';
  $st = db()->prepare("INSERT INTO products
    (id, slug, name, tagline, description, price, gradient, emoji, image_url,
     flavors, sizes, allergens, contains_nuts, stock, sold, featured, active, sort_order, created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)");
  $st->execute([$id, $slug, $d['name'] ?? 'New Brownie', $d['tagline'] ?? '', $d['description'] ?? '',
    (int)($d['price'] ?? 0), $d['gradient'] ?? 'linear-gradient(135deg,#5b3a29,#2b1a12)', $d['emoji'] ?? '🍫',
    $d['imageUrl'] ?? null, json_encode($d['flavors'] ?? []), json_encode($d['sizes'] ?? []),
    json_encode($d['allergens'] ?? []), !empty($d['containsNuts'])?1:0, (int)($d['stock'] ?? 0), 0,
    !empty($d['featured'])?1:0, isset($d['active']) ? ((int)!!$d['active']) : 1, (int)($d['sort'] ?? 0), now_ms()]);
  return product_get($id, true);
}

/* ---------------- orders ---------------- */
/**
 * Removes a product from the catalogue for good.
 *
 * Safe with respect to order history: order_create() snapshots the name,
 * price, size and image of every line into the order itself, so past orders
 * still render correctly once the product row is gone.
 */
function product_delete(string $id): bool {
  $st = db()->prepare("DELETE FROM products WHERE id=?");
  $st->execute([$id]);
  return $st->rowCount() > 0;
}

function next_order_id(): string {
  db()->exec("UPDATE counters SET value = value + 1 WHERE name='orderSeq'");
  $v = db()->query("SELECT value FROM counters WHERE name='orderSeq'")->fetch()['value'];
  return 'FUD-' . $v;
}
// Strip markup and control characters from anything a customer types, and cap
// its length. Output is still escaped when rendered — this is defence in depth.
function clean_text($s, int $max = 200): string {
  $s = is_string($s) ? $s : '';
  $s = strip_tags($s);
  $s = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u', '', $s) ?? '';
  return trim(mb_substr($s, 0, $max));
}

function order_create(array $items, array $customer, ?string $userId): array {
  foreach (['name'=>80,'phone'=>30,'email'=>191,'address'=>300,'city'=>60,'notes'=>300] as $f=>$max)
    if (isset($customer[$f])) $customer[$f] = clean_text($customer[$f], $max);

  if (!$items) return ['error' => 'Your cart is empty.'];
  foreach (['name','phone','email','address','city'] as $f)
    if (empty($customer[$f])) return ['error' => 'Please provide your name, phone, email, address and city.'];
  if (!filter_var($customer['email'], FILTER_VALIDATE_EMAIL))
    return ['error' => 'Please enter a valid email address.'];
  $digits = preg_replace('/\D/', '', $customer['phone']);
  if (strlen($digits) < 10 || strlen($digits) > 15)
    return ['error' => 'Please enter a valid phone number.'];
  // We currently deliver in Lahore only.
  $allowedCity = env('DELIVERY_CITY', 'Lahore');
  if (strcasecmp(trim($customer['city']), $allowedCity) !== 0)
    return ['error' => "Sorry, we currently deliver in $allowedCity only."];

  $email = strtolower(trim($customer['email']));

  // The email must have been confirmed with a code before an order is accepted.
  if (!email_is_verified($email))
    return ['error' => 'Please verify your email address before placing the order.'];

  // --- Silent abuse controls (deliberately not advertised on the site) ---
  $now = now_ms();
  $hour = 3600000;

  // One order per email address per hour.
  try {
    $st = db()->prepare("SELECT COUNT(*) c FROM orders WHERE created_at > ? AND LOWER(customer) LIKE ?");
    $st->execute([$now - $hour, '%"email":"' . str_replace('%','\\%',$email) . '"%']);
    if ((int)$st->fetch()['c'] > 0) return ['error' => 'We could not place this order right now. Please try again later.'];
  } catch (Throwable $e) {}

  // One order per phone number per hour (stops trivially swapping the email).
  try {
    $st = db()->prepare("SELECT COUNT(*) c FROM orders WHERE created_at > ? AND customer LIKE ?");
    $st->execute([$now - $hour, '%"phone":"' . str_replace('%','\\%',trim($customer['phone'])) . '"%']);
    if ((int)$st->fetch()['c'] > 0) return ['error' => 'We could not place this order right now. Please try again later.'];
  } catch (Throwable $e) {}

  // Per-IP cap so one machine cannot place many orders with different details.
  // Only *placed* orders count (the hit is recorded at the end of this function),
  // otherwise a customer who mistypes their address a few times would lock
  // themselves out. The limit is generous because mobile carriers here put a lot
  // of real customers behind the same IP.
  $ip = function_exists('client_ip') ? client_ip() : ($_SERVER['REMOTE_ADDR'] ?? '');
  if ($ip !== '' && rate_count('order:' . $ip, $hour) >= (int) env('MAX_ORDERS_PER_IP', '8'))
    return ['error' => 'We could not place this order right now. Please try again later.'];

  // Bulk-order guards: cap per-line quantity, total units and order value.
  $maxPerLine  = (int) env('MAX_QTY_PER_ITEM', '20');
  $maxUnits    = (int) env('MAX_UNITS_PER_ORDER', '30');
  $maxValue    = (int) env('MAX_ORDER_VALUE', '50000');
  $totalUnits  = 0;
  if (count($items) > 30) return ['error' => 'That is too many different items for one online order.'];
  foreach ($items as $it) {
    // Quantities must be whole numbers of at least 1. Anything else (0, a
    // negative, a decimal, a string) is a broken or tampered request, not a
    // number to silently round up.
    $raw = $it['qty'] ?? 1;
    if (!is_int($raw) && !(is_string($raw) && ctype_digit($raw)) && !(is_float($raw) && floor($raw) == $raw))
      return ['error' => 'Please choose a valid quantity.'];
    $q = (int) $raw;
    if ($q < 1) return ['error' => 'Please choose a valid quantity.'];
    if ($q > $maxPerLine) return ['error' => "For large orders please contact us directly — maximum $maxPerLine per item online."];
    $totalUnits += $q;
  }
  if ($totalUnits > $maxUnits)
    return ['error' => "For bulk orders please contact us directly — maximum $maxUnits items per online order."];

  $lineItems = []; $subtotal = 0;
  foreach ($items as $it) {
    $p = product_get($it['productId'] ?? '');
    if (!$p) return ['error' => 'A product in your cart is no longer available.'];
    $qty = max(1, (int)($it['qty'] ?? 1));
    if ($p['stock'] < $qty) return ['error' => "Only {$p['stock']} left of {$p['name']}."];
    $unit = $p['price']; $sizeLabel = '';
    if ($p['sizes']) {
      $size = null;
      foreach ($p['sizes'] as $s) if (($s['label'] ?? '') === ($it['size'] ?? '')) $size = $s;
      if (!$size) $size = $p['sizes'][0];
      $unit = (int)$size['price']; $sizeLabel = $size['label'];
    }
    $lineTotal = $unit * $qty; $subtotal += $lineTotal;
    $lineItems[] = ['productId'=>$p['id'],'name'=>$p['name'],'emoji'=>$p['emoji'],
      'size'=>$sizeLabel,'qty'=>$qty,'price'=>$unit,'lineTotal'=>$lineTotal];
  }
  // Everything that can reject the order must run BEFORE stock is committed,
  // otherwise a rejected order would silently eat inventory.
  $s = settings_get();
  if (empty($s['storeOpen'])) return ['error' => 'Sorry, we are currently not accepting orders. Please check back soon.'];
  if ($subtotal > $maxValue)
    return ['error' => 'For large orders please contact us directly so we can arrange it properly.'];

  // commit stock
  foreach ($lineItems as $li) {
    $p = product_get($li['productId'], true);
    product_update($p['id'], ['stock'=>$p['stock']-$li['qty'], 'sold'=>$p['sold']+$li['qty']]);
  }
  $delivery = $subtotal >= $s['freeDeliveryOver'] ? 0 : $s['deliveryFee'];
  $now = now_ms();
  $order = [
    'id'=>next_order_id(),'userId'=>$userId,'items'=>$lineItems,
    'customer'=>[
      'name'=>trim($customer['name']),'phone'=>trim($customer['phone']),
      'address'=>trim($customer['address']),'city'=>trim($customer['city']),
      'notes'=>trim($customer['notes'] ?? ''),'email'=>trim($customer['email'] ?? ''),
    ],
    'subtotal'=>$subtotal,'deliveryFee'=>$delivery,'total'=>$subtotal+$delivery,
    'paymentMethod'=>'COD','status'=>'Pending','statusHistory'=>[['status'=>'Pending','at'=>$now]],
    'createdAt'=>$now,
  ];
  $st = db()->prepare("INSERT INTO orders (id,user_id,items,customer,subtotal,delivery_fee,total,payment_method,status,status_history,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)");
  $st->execute([$order['id'],$userId,json_encode($order['items']),json_encode($order['customer']),
    $order['subtotal'],$order['deliveryFee'],$order['total'],'COD','Pending',json_encode($order['statusHistory']),$now]);

  // upsert customer record
  $user = $userId ? user_by_id($userId) : null;
  if (!$user) $user = user_by_phone($order['customer']['phone']);
  if (!$user) {
    $user = user_create(['name'=>$order['customer']['name'],'phone'=>$order['customer']['phone'],
      'email'=>$order['customer']['email'] ?: null,'city'=>$order['customer']['city'],'address'=>$order['customer']['address']]);
  }
  user_update($user['id'], [
    'name'=>$order['customer']['name'],'phone'=>$order['customer']['phone'],
    'city'=>$order['customer']['city'],'address'=>$order['customer']['address'],
    'order_count'=>$user['orders']+1,'total_spent'=>$user['totalSpent']+$order['total'],'last_order_at'=>$now,
  ]);
  if (!$userId) { db()->prepare("UPDATE orders SET user_id=? WHERE id=?")->execute([$user['id'],$order['id']]); $order['userId']=$user['id']; }

  // The confirmation is single-use. Expire the code as well as the confirmation,
  // otherwise anyone holding the old code could simply replay it.
  try {
    db()->prepare("UPDATE email_otp SET verified_at=NULL, code_hash='', expires_at=0 WHERE email=?")
       ->execute([$email]);
  } catch (Throwable $e) {}
  // Count this IP only now that an order really exists.
  if ($ip !== '') rate_hit('order:' . $ip, $ip);

  notify_order($order);
  return ['order' => $order];
}

// Email the shop owner when an order arrives (PHP mail, works on Hostinger).
// Set ORDER_NOTIFY_TO (or CONTACT_EMAIL) in .env to receive these.
function notify_order(array $o): void {
  $to = env('ORDER_NOTIFY_TO', env('CONTACT_EMAIL'));
  if (!$to) return;
  $cur = cfg()['currency'];
  $lines = '';
  foreach ($o['items'] as $li)
    $lines .= "- {$li['qty']}x {$li['name']}" . ($li['size'] ? " ({$li['size']})" : '') . " - $cur " . number_format($li['lineTotal']) . "\n";
  $c = $o['customer'];
  $body = "New Fudgio order {$o['id']}\n\nName: {$c['name']}\nPhone: {$c['phone']}\nCity: {$c['city']}\nAddress: {$c['address']}\n"
    . (!empty($c['notes']) ? "Notes: {$c['notes']}\n" : '')
    . "\nItems:\n$lines\nSubtotal: $cur " . number_format($o['subtotal'])
    . "\nDelivery: " . ($o['deliveryFee'] == 0 ? 'FREE' : "$cur " . number_format($o['deliveryFee']))
    . "\nTOTAL: $cur " . number_format($o['total']) . " (Cash on Delivery)\n\nManage it in your admin dashboard.";
  send_mail($to, "New order {$o['id']} - $cur " . number_format($o['total']) . ' (COD)', $body);
}
function orders_all(?string $userId = null): array {
  if ($userId) { $st = db()->prepare("SELECT * FROM orders WHERE user_id=? ORDER BY created_at DESC"); $st->execute([$userId]); $rows=$st->fetchAll(); }
  else $rows = db()->query("SELECT * FROM orders ORDER BY created_at DESC")->fetchAll();
  return array_map('map_order', $rows);
}
function order_get(string $id): ?array {
  $st = db()->prepare("SELECT * FROM orders WHERE id=? LIMIT 1"); $st->execute([$id]);
  $r = $st->fetch(); return $r ? map_order($r) : null;
}
function order_update_status(string $id, string $status): array {
  $allowed = ['Pending','Confirmed','Baking','Out for Delivery','Delivered','Cancelled'];
  if (!in_array($status, $allowed, true)) return ['error' => 'Invalid status.'];
  $o = order_get($id);
  if (!$o) return ['error' => 'Order not found.'];
  if ($status === 'Cancelled' && $o['status'] !== 'Cancelled') {
    foreach ($o['items'] as $li) {
      $p = product_get($li['productId'], true);
      if ($p) product_update($p['id'], ['stock'=>$p['stock']+$li['qty'], 'sold'=>max(0,$p['sold']-$li['qty'])]);
    }
  }
  $hist = $o['statusHistory']; $hist[] = ['status'=>$status,'at'=>now_ms()];
  db()->prepare("UPDATE orders SET status=?, status_history=? WHERE id=?")->execute([$status, json_encode($hist), $id]);
  return ['order' => order_get($id)];
}

/* ---------------- users ---------------- */
function user_by_id(string $id): ?array { $st=db()->prepare("SELECT * FROM users WHERE id=? LIMIT 1"); $st->execute([$id]); $r=$st->fetch(); return $r?map_user($r):null; }
function user_row_by_email(string $email): ?array { $st=db()->prepare("SELECT * FROM users WHERE email=? LIMIT 1"); $st->execute([strtolower($email)]); $r=$st->fetch(); return $r?:null; }
function user_by_phone(string $phone): ?array { $st=db()->prepare("SELECT * FROM users WHERE phone=? LIMIT 1"); $st->execute([$phone]); $r=$st->fetch(); return $r?map_user($r):null; }
function user_create(array $u): array {
  $id = gen_id();
  $st = db()->prepare("INSERT INTO users (id,name,email,phone,password_hash,google_id,avatar_url,city,address,order_count,total_spent,created_at,last_login_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)");
  $st->execute([$id,$u['name']??null,isset($u['email'])?strtolower((string)$u['email']):null,$u['phone']??null,
    $u['passwordHash']??null,$u['googleId']??null,$u['avatarUrl']??null,$u['city']??null,$u['address']??null,
    (int)($u['orders']??0),(int)($u['totalSpent']??0),now_ms(),now_ms()]);
  return user_by_id($id);
}
function user_update(string $id, array $patch): ?array {
  $cols = ['name'=>'name','email'=>'email','phone'=>'phone','password_hash'=>'password_hash',
    'avatar_url'=>'avatar_url','city'=>'city','address'=>'address','order_count'=>'order_count',
    'total_spent'=>'total_spent','last_order_at'=>'last_order_at','last_login_at'=>'last_login_at'];
  $sets = []; $vals = [];
  foreach ($patch as $k=>$v) { if (isset($cols[$k])) { $sets[]="$k=?"; $vals[]=$v; } }
  if ($sets) { $vals[]=$id; db()->prepare("UPDATE users SET ".implode(',',$sets)." WHERE id=?")->execute($vals); }
  return user_by_id($id);
}
function users_all(): array {
  $rows = db()->query("SELECT * FROM users ORDER BY COALESCE(last_order_at, created_at) DESC")->fetchAll();
  return array_map('map_user', $rows);
}

/* ---------------- order delete ---------------- */
function order_delete(string $id): bool {
  $o = order_get($id);
  if (!$o) return false;
  // restock if it wasn't cancelled
  if ($o['status'] !== 'Cancelled') {
    foreach ($o['items'] as $li) {
      $p = product_get($li['productId'], true);
      if ($p) product_update($p['id'], ['stock'=>$p['stock']+$li['qty'], 'sold'=>max(0,$p['sold']-$li['qty'])]);
    }
  }
  db()->prepare("DELETE FROM orders WHERE id=?")->execute([$id]);
  return true;
}

/* ---------------- settings (store config editable from admin) ---------------- */
function settings_get(): array {
  $c = cfg();
  $defaults = ['deliveryFee'=>$c['deliveryFee'], 'freeDeliveryOver'=>$c['freeDeliveryOver'], 'storeOpen'=>true, 'announcement'=>''];
  try {
    db()->exec("CREATE TABLE IF NOT EXISTS settings (k VARCHAR(40) PRIMARY KEY, v TEXT)");
    $row = db()->query("SELECT v FROM settings WHERE k='store'")->fetch();
    if ($row) return array_merge($defaults, jdec($row['v'], []));
  } catch (Throwable $e) {}
  return $defaults;
}
function settings_set(array $patch): array {
  db()->exec("CREATE TABLE IF NOT EXISTS settings (k VARCHAR(40) PRIMARY KEY, v TEXT)");
  $cur = settings_get();
  if (isset($patch['deliveryFee'])) $cur['deliveryFee'] = max(0,(int)$patch['deliveryFee']);
  if (isset($patch['freeDeliveryOver'])) $cur['freeDeliveryOver'] = max(0,(int)$patch['freeDeliveryOver']);
  if (isset($patch['storeOpen'])) $cur['storeOpen'] = !!$patch['storeOpen'];
  if (isset($patch['announcement'])) $cur['announcement'] = (string)$patch['announcement'];
  $v = json_encode($cur);
  $driver = db_driver();
  if ($driver==='mysql') db()->prepare("INSERT INTO settings (k,v) VALUES ('store',?) ON DUPLICATE KEY UPDATE v=?")->execute([$v,$v]);
  else db()->prepare("INSERT OR REPLACE INTO settings (k,v) VALUES ('store',?)")->execute([$v]);
  return $cur;
}
function orders_csv(): string {
  $rows = orders_all();
  $out = "Order,Date,Name,Phone,Email,City,Address,Items,Total,Payment,Status\n";
  foreach ($rows as $o) {
    $items = implode('; ', array_map(fn($li)=>"{$li['qty']}x {$li['name']}".($li['size']?" ({$li['size']})":''), $o['items']));
    $c = $o['customer'];
    $cells = [$o['id'], date('Y-m-d H:i', (int)($o['createdAt']/1000)), $c['name']??'', $c['phone']??'', $c['email']??'',
      $c['city']??'', $c['address']??'', $items, $o['total'], $o['paymentMethod'], $o['status']];
    $out .= implode(',', array_map(fn($x)=>'"'.str_replace('"','""',(string)$x).'"', $cells)) . "\n";
  }
  return $out;
}

/* ---------------- generic rate limiting ---------------- */
function rate_hit(string $bucket, string $ip): void {
  try {
    db()->prepare("INSERT INTO rate_hits (id,bucket,ip,created_at) VALUES (?,?,?,?)")
       ->execute([gen_id(), $bucket, $ip, now_ms()]);
    // opportunistic cleanup of anything older than a day
    db()->prepare("DELETE FROM rate_hits WHERE created_at < ?")->execute([now_ms() - 86400000]);
  } catch (Throwable $e) {}
}
function rate_count(string $bucket, int $windowMs): int {
  try {
    $st = db()->prepare("SELECT COUNT(*) c FROM rate_hits WHERE bucket=? AND created_at > ?");
    $st->execute([$bucket, now_ms() - $windowMs]);
    return (int) $st->fetch()['c'];
  } catch (Throwable $e) { return 0; }
}

/* ---------------- email verification (OTP) ---------------- */
function otp_row(string $email): ?array {
  $st = db()->prepare("SELECT * FROM email_otp WHERE email=? LIMIT 1");
  $st->execute([strtolower(trim($email))]);
  $r = $st->fetch();
  return $r ?: null;
}
function otp_send(string $email, string $ip): array {
  $email = strtolower(trim($email));
  if (!filter_var($email, FILTER_VALIDATE_EMAIL)) return ['error' => 'Please enter a valid email address.'];

  $now = now_ms();
  $row = otp_row($email);

  // Anti-abuse: cooldown between sends, and a daily cap per address.
  if ($row) {
    if ($row['last_sent'] !== null && $now - (int)$row['last_sent'] < 45000)
      return ['error' => 'Please wait a moment before requesting another code.'];
    if ((int)$row['sends'] >= (int) env('MAX_CODES_PER_EMAIL', '15') && $now - (int)$row['created_at'] < 86400000)
      return ['error' => 'Too many codes requested for this address. Please try again later.'];
  }
  // Per-IP cap so one machine cannot spray codes at many addresses. Kept high
  // because many genuine customers share a carrier IP.
  if (rate_count('otp:' . $ip, 3600000) >= (int) env('MAX_CODES_PER_IP', '40'))
    return ['error' => 'Too many verification attempts. Please try again later.'];
  rate_hit('otp:' . $ip, $ip);

  $code = str_pad((string) random_int(0, 99999), 5, '0', STR_PAD_LEFT);
  $hash = password_hash($code, PASSWORD_BCRYPT);
  $expires = $now + 10 * 60 * 1000;   // 10 minutes

  if ($row) {
    db()->prepare("UPDATE email_otp SET code_hash=?, expires_at=?, attempts=0, sends=sends+1, last_sent=?, verified_at=NULL WHERE email=?")
       ->execute([$hash, $expires, $now, $email]);
  } else {
    db()->prepare("INSERT INTO email_otp (email,code_hash,expires_at,attempts,sends,last_sent,verified_at,created_at) VALUES (?,?,?,0,1,?,NULL,?)")
       ->execute([$email, $hash, $expires, $now, $now]);
  }

  $brand = cfg()['brandName'];
  $subject = $code . ' is your ' . $brand . ' verification code';
  $text = "Your $brand verification code is: $code\n\n"
        . "Enter this code on the checkout page to confirm your email and place your order.\n"
        . "The code expires in 10 minutes.\n\n"
        . "If you didn't request this, you can ignore this email.\n\n- $brand";
  $html = '<div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:auto;border:1px solid #eee;border-radius:14px;overflow:hidden">'
        . '<div style="background:linear-gradient(135deg,#c9762e,#f2557c);color:#fff;padding:20px 24px">'
        . '<h2 style="margin:0;font-size:20px">🍫 ' . htmlspecialchars($brand) . ' — verify your email</h2></div>'
        . '<div style="padding:24px">'
        . '<p style="margin:0 0 14px;color:#444">Use this code to confirm your email and place your order:</p>'
        . '<div style="font-size:34px;font-weight:800;letter-spacing:10px;color:#a85413;text-align:center;'
        . 'background:#fff6ec;border:1px solid #f0cfa4;border-radius:12px;padding:16px 10px">' . $code . '</div>'
        . '<p style="color:#777;font-size:13px;margin:16px 0 0">This code expires in 10 minutes. '
        . "If you didn't request it, you can safely ignore this email.</p></div></div>";

  [$ok, $err] = send_mail($email, $subject, $text, $html);
  if (!$ok) {
    error_log('Fudgio OTP send failed: ' . $err);
    return ['error' => 'We could not send the code right now. Please try again in a moment.'];
  }
  return ['ok' => true];
}

function otp_check(string $email, string $code): array {
  $email = strtolower(trim($email));
  $row = otp_row($email);
  if (!$row) return ['error' => 'Please request a verification code first.'];
  if ((int)$row['attempts'] >= 6) return ['error' => 'Too many incorrect attempts. Please request a new code.'];
  if (now_ms() > (int)$row['expires_at']) return ['error' => 'That code has expired. Please request a new one.'];

  db()->prepare("UPDATE email_otp SET attempts=attempts+1 WHERE email=?")->execute([$email]);
  if (!password_verify(trim($code), (string)$row['code_hash']))
    return ['error' => 'That code is not correct. Please check and try again.'];

  db()->prepare("UPDATE email_otp SET verified_at=?, attempts=0 WHERE email=?")->execute([now_ms(), $email]);
  return ['ok' => true];
}

// An address counts as verified for a limited window after confirming the code.
function email_is_verified(string $email): bool {
  $row = otp_row($email);
  if (!$row || $row['verified_at'] === null) return false;
  return (now_ms() - (int)$row['verified_at']) < 2 * 3600 * 1000;   // 2 hours
}

/* ---------------- visitor tracking ---------------- */
function record_visit(string $page, string $visitor, string $ip, string $ref, string $ua): void {
  try {
    // Everything here comes from the browser, so strip markup before storing.
    $page = clean_text($page, 191);
    if ($page === '' || $page[0] !== '/') $page = '/';
    $st = db()->prepare("INSERT INTO visits (id,visitor,page,ip,referrer,ua,created_at) VALUES (?,?,?,?,?,?,?)");
    $st->execute([gen_id(), clean_text($visitor,40), $page, substr($ip,0,64),
                  clean_text($ref,255), clean_text($ua,255), now_ms()]);
  } catch (Throwable $e) { /* never break the page over analytics */ }
}
function visit_stats(): array {
  try {
    $rows = db()->query("SELECT visitor,page,created_at FROM visits")->fetchAll();
  } catch (Throwable $e) { return ['totalViews'=>0,'uniqueVisitors'=>0,'viewsToday'=>0,'visitorsToday'=>0,'topPages'=>[],'byDay'=>[]]; }
  $todayStart = strtotime('today') * 1000;
  $visitors = []; $visitorsToday = []; $pages = []; $viewsToday = 0;
  foreach ($rows as $r) {
    $visitors[$r['visitor']] = true;
    $pages[$r['page']] = ($pages[$r['page']] ?? 0) + 1;
    if ((int)$r['created_at'] >= $todayStart) { $viewsToday++; $visitorsToday[$r['visitor']] = true; }
  }
  arsort($pages);
  $topPages = [];
  foreach (array_slice($pages, 0, 8, true) as $p => $n) $topPages[] = ['page'=>$p ?: '/', 'views'=>$n];
  $byDay = [];
  for ($i=13;$i>=0;$i--) {
    $start = strtotime("today -$i days")*1000; $end=$start+86400000;
    $v = 0; foreach ($rows as $r) if ((int)$r['created_at']>=$start && (int)$r['created_at']<$end) $v++;
    $byDay[] = ['label'=>date('M j', (int)($start/1000)), 'views'=>$v];
  }
  return [
    'totalViews'=>count($rows), 'uniqueVisitors'=>count($visitors),
    'viewsToday'=>$viewsToday, 'visitorsToday'=>count($visitorsToday),
    'topPages'=>$topPages, 'byDay'=>$byDay,
  ];
}

/* ---------------- analytics ---------------- */
function analytics(): array {
  $orders = orders_all(); $products = products_all(true); $users = users_all();
  $active = array_values(array_filter($orders, fn($o)=>$o['status']!=='Cancelled'));
  $delivered = array_values(array_filter($orders, fn($o)=>$o['status']==='Delivered'));
  $revenue = array_sum(array_map(fn($o)=>$o['total'], $active));

  $per = [];
  foreach ($active as $o) foreach ($o['items'] as $li) {
    $k=$li['productId'];
    if(!isset($per[$k])) $per[$k]=['name'=>$li['name'],'emoji'=>$li['emoji'],'units'=>0,'revenue'=>0];
    $per[$k]['units']+=$li['qty']; $per[$k]['revenue']+=$li['lineTotal'];
  }
  $top = array_values($per); usort($top, fn($a,$b)=>$b['units']-$a['units']);

  $days = [];
  for ($i=13;$i>=0;$i--) {
    $start = strtotime("today -$i days")*1000; $end=$start+86400000;
    $dayOrders = array_filter($active, fn($o)=>$o['createdAt']>=$start && $o['createdAt']<$end);
    $days[] = ['label'=>date('M j', (int)($start/1000)),'orders'=>count($dayOrders),
      'revenue'=>array_sum(array_map(fn($o)=>$o['total'],$dayOrders))];
  }
  $cities = [];
  foreach ($active as $o) { $c=$o['customer']['city']??'Unknown'; $cities[$c]=($cities[$c]??0)+1; }
  arsort($cities);
  $cityBreakdown = []; foreach ($cities as $city=>$n) $cityBreakdown[]=['city'=>$city,'count'=>$n];

  $statusCounts = [];
  foreach ($orders as $o) $statusCounts[$o['status']]=($statusCounts[$o['status']]??0)+1;

  $lowStock = [];
  foreach ($products as $p) if ($p['active'] && $p['stock']<=10) $lowStock[]=['id'=>$p['id'],'name'=>$p['name'],'stock'=>$p['stock'],'emoji'=>$p['emoji']];
  usort($lowStock, fn($a,$b)=>$a['stock']-$b['stock']);

  $units = 0; foreach ($active as $o) foreach ($o['items'] as $li) $units+=$li['qty'];
  $activeProducts = array_filter($products, fn($p)=>$p['active']);
  $vs = visit_stats();

  return [
    'visits'=>$vs,
    'totals'=>[
      'revenue'=>$revenue,'orders'=>count($orders),'activeOrders'=>count($active),
      'cancelledOrders'=>count($orders)-count($active),'deliveredOrders'=>count($delivered),
      'customers'=>count($users),'unitsSold'=>$units,
      'avgOrderValue'=>count($active)?(int)round($revenue/count($active)):0,
      'products'=>count($activeProducts),
      'outOfStock'=>count(array_filter($products, fn($p)=>$p['active']&&$p['stock']===0)),
      'pendingOrders'=>count(array_filter($orders, fn($o)=>in_array($o['status'],['Pending','Confirmed','Baking'],true))),
      'pageViews'=>$vs['totalViews'], 'visitors'=>$vs['uniqueVisitors'], 'viewsToday'=>$vs['viewsToday'], 'visitorsToday'=>$vs['visitorsToday'],
    ],
    'topProducts'=>$top,'salesByDay'=>$days,'cityBreakdown'=>$cityBreakdown,
    'statusCounts'=>(object)$statusCounts,'lowStock'=>$lowStock,
  ];
}
