<?php
// Fudgio data layer (PHP + PDO). Connects to MySQL (your Google Cloud SQL /
// Hostinger MySQL) when DB_HOST is set in .env, otherwise falls back to a local
// SQLite file so the app still runs for development. Mirrors the Node schema.
declare(strict_types=1);
require_once __DIR__ . '/mailer.php';
require_once __DIR__ . '/sms.php';
require_once __DIR__ . '/catalog.php';

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
    sort_order INT DEFAULT 0, created_at BIGINT, color VARCHAR(16), ink VARCHAR(16))");
  $pdo->exec("CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(40) PRIMARY KEY, name VARCHAR(160), email VARCHAR(191), phone VARCHAR(40),
    password_hash VARCHAR(255), google_id VARCHAR(64), avatar_url TEXT,
    city VARCHAR(120), address TEXT, order_count INT DEFAULT 0, total_spent INT DEFAULT 0,
    created_at BIGINT, last_order_at BIGINT, last_login_at BIGINT)");
  $pdo->exec("CREATE TABLE IF NOT EXISTS orders (
    id VARCHAR(40) PRIMARY KEY, user_id VARCHAR(40), items TEXT, customer TEXT,
    subtotal INT, delivery_fee INT, total INT, payment_method VARCHAR(20),
    status VARCHAR(40), status_history TEXT, created_at BIGINT, currency VARCHAR(8) DEFAULT 'PKR',
    discount INT DEFAULT 0)");
  $pdo->exec("CREATE TABLE IF NOT EXISTS visits (
    id VARCHAR(40) PRIMARY KEY, visitor VARCHAR(40), page VARCHAR(191), ip VARCHAR(64),
    referrer VARCHAR(255), ua VARCHAR(255), created_at BIGINT)");
  // Checkout is gated by an image CAPTCHA rather than an emailed code; the
  // old email_otp table is no longer created. An existing one is left alone
  // rather than dropped, so no live data disappears on deploy.
  $pdo->exec("CREATE TABLE IF NOT EXISTS captcha (
    id VARCHAR(40) PRIMARY KEY, answer_hash VARCHAR(80), expires_at BIGINT,
    attempts INT DEFAULT 0, used INT DEFAULT 0, created_at BIGINT)");
  $pdo->exec("CREATE TABLE IF NOT EXISTS rate_hits (
    id VARCHAR(40) PRIMARY KEY, bucket VARCHAR(80), ip VARCHAR(64), created_at BIGINT)");
  $pdo->exec("CREATE TABLE IF NOT EXISTS counters (name VARCHAR(40) PRIMARY KEY, value BIGINT)");
  $pdo->exec("CREATE TABLE IF NOT EXISTS settings (k VARCHAR(40) PRIMARY KEY, v TEXT)");
  // "Get new colours first" sign-ups, and messages from the contact form.
  $pdo->exec("CREATE TABLE IF NOT EXISTS subscribers (
    email VARCHAR(191) PRIMARY KEY, source VARCHAR(40), created_at BIGINT)");
  $pdo->exec("CREATE TABLE IF NOT EXISTS messages (
    id VARCHAR(40) PRIMARY KEY, name VARCHAR(120), email VARCHAR(191), phone VARCHAR(40),
    topic VARCHAR(60), body TEXT, status VARCHAR(20) DEFAULT 'new', created_at BIGINT)");
  $pdo->exec("INSERT " . ($driver === 'mysql' ? 'IGNORE ' : 'OR IGNORE ') .
             "INTO counters (name, value) VALUES ('orderSeq', 1000)");

  // Also seeds a brand-new database: the catalogue insert in db_migrate()
  // adds every colour a fresh shop does not have yet.
  db_migrate($pdo, $driver);
}

/** Reads/writes one small value in the settings table (not the 'store' JSON). */
function meta_get(PDO $pdo, string $k): string {
  try { $r = $pdo->prepare("SELECT v FROM settings WHERE k=?"); $r->execute([$k]); $row = $r->fetch(); return $row ? (string)$row['v'] : ''; }
  catch (Throwable $e) { return ''; }
}
function meta_set(PDO $pdo, string $driver, string $k, string $v): void {
  if ($driver === 'mysql') $pdo->prepare("INSERT INTO settings (k,v) VALUES (?,?) ON DUPLICATE KEY UPDATE v=?")->execute([$k, $v, $v]);
  else $pdo->prepare("INSERT OR REPLACE INTO settings (k,v) VALUES (?,?)")->execute([$k, $v]);
}

/**
 * Brings an existing database up to date. Runs on every request, so it is
 * split in two:
 *
 *  - One-time steps, gated by a `schema` level stored in settings. These are
 *    the ones that write: switching the shop from brownies to bandanas, adding
 *    the order currency column, renaming a retired status. Once the level is
 *    recorded they cost a single SELECT.
 *  - Size enforcement, which must keep holding as the admin edits products
 *    but issues no UPDATE once every row already matches.
 */
function db_migrate(PDO $pdo, string $driver = 'sqlite'): void {
  try {
    $level = (int) meta_get($pdo, 'schema');

    if ($level < 2) {
      // Columns added since the brownie shop. Each is checked first so this
      // is safe on a database that already has some of them.
      $add = function (string $table, string $col, string $type) use ($pdo) {
        try { $pdo->query("SELECT $col FROM $table LIMIT 1"); }
        catch (Throwable $e) { $pdo->exec("ALTER TABLE $table ADD COLUMN $col $type"); }
      };
      $add('orders', 'currency', "VARCHAR(8) DEFAULT 'PKR'");   // PKR in Pakistan, USD abroad
      $add('orders', 'discount', 'INT DEFAULT 0');              // the buy-3 deal
      $add('products', 'color', 'VARCHAR(16)');                 // ground colour of the print
      $add('products', 'ink', 'VARCHAR(16)');                   // colour the print is in

      // "Baking" meant nothing for a bandana. Orders sitting in it move on.
      $pdo->exec("UPDATE orders SET status='Packed' WHERE status='Baking'");

      // The shop now sells bandanas. The brownies are hidden, not deleted:
      // past orders keep their own copies of every line, and the admin can
      // remove the hidden rows for good with Delete if they want them gone.
      // On a new database this same insert is the seed.
      $retired = retired_slugs();
      $marks = implode(',', array_fill(0, count($retired), '?'));
      $pdo->prepare("UPDATE products SET active=0, featured=0 WHERE slug IN ($marks)")->execute($retired);

      $have = [];
      foreach ($pdo->query("SELECT slug FROM products")->fetchAll() as $r) $have[$r['slug']] = true;
      foreach (bandana_catalog() as $b) if (empty($have[$b['slug']])) db_insert_product($pdo, $b);

      meta_set($pdo, $driver, 'schema', '2');
    }

    db_enforce_sizes($pdo);
  } catch (Throwable $e) { /* never block a page load on a migration */ }
}

/**
 * Every bandana is the same 55 cm square, so each colour has exactly one size.
 * The rupee and dollar prices the admin set are kept; anything else on the
 * row (a pack from an earlier version, a stray label) is folded away.
 */
function db_enforce_sizes(PDO $pdo): void {
  $want = bandana_sizes()[0];
  $rows = $pdo->query("SELECT id, sizes FROM products WHERE active=1")->fetchAll();
  $upd = $pdo->prepare("UPDATE products SET sizes=? WHERE id=?");
  foreach ($rows as $r) {
    $current = json_decode($r['sizes'] ?? '[]', true) ?: [];
    // Prefer the price set on a single; fall back to whatever came first.
    $have = [];
    foreach ($current as $sz) if ((int)($sz['pieces'] ?? 1) === 1) { $have = $sz; break; }
    if (!$have && $current) $have = $current[0];
    $next = [[
      'label'  => $want['label'],
      'pieces' => 1,
      'price'  => isset($have['price']) && (int)$have['price'] > 0 ? (int)$have['price'] : $want['price'],
      'usd'    => isset($have['usd'])   && (int)$have['usd']   > 0 ? (int)$have['usd']   : $want['usd'],
    ]];
    if (json_encode($next) !== json_encode($current)) $upd->execute([json_encode($next), $r['id']]);
  }
}

/** Inserts one catalogue entry (see bandana_catalog()). */
function db_insert_product(PDO $pdo, array $b): void {
  $st = $pdo->prepare("INSERT INTO products
    (id, slug, name, tagline, description, price, gradient, emoji, image_url,
     flavors, sizes, allergens, contains_nuts, stock, sold, featured, active, sort_order, created_at, color, ink)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)");
  $st->execute([gen_id(), $b['slug'], $b['name'], $b['tagline'], $b['description'],
    (int)$b['sizes'][0]['price'], $b['gradient'], $b['emoji'], null,
    json_encode([$b['name']]), json_encode($b['sizes']), json_encode($b['details']), 0,
    (int)$b['stock'], 0, !empty($b['featured']) ? 1 : 0, 1, (int)$b['sort'], now_ms(),
    $b['color'] ?? null, $b['ink'] ?? null]);
}


/* ---------------- helpers ---------------- */
/** Keeps a size list to the fields orders are priced from, with sane numbers. */
function clean_sizes(array $sizes): array {
  $out = [];
  foreach ($sizes as $sz) {
    if (!is_array($sz)) continue;
    $label = trim(clean_text($sz['label'] ?? '', 40));
    if ($label === '') continue;
    $row = ['label' => $label, 'price' => max(0, (int)($sz['price'] ?? 0))];
    if (isset($sz['pieces'])) $row['pieces'] = max(1, (int)$sz['pieces']);
    if (isset($sz['usd']) && (int)$sz['usd'] > 0) $row['usd'] = (int)$sz['usd'];
    $out[] = $row;
  }
  return $out;
}
function now_ms(): int { return (int) round(microtime(true) * 1000); }
function gen_id(): string { return base_convert((string) time(), 10, 36) . bin2hex(random_bytes(4)); }
function jdec($s, $d = []) { if ($s === null || $s === '') return $d; $v = json_decode($s, true); return $v === null ? $d : $v; }

function map_product(array $r): array {
  return [
    'id'=>$r['id'],'slug'=>$r['slug'],'name'=>$r['name'],'tagline'=>$r['tagline'],
    'description'=>$r['description'],'price'=>(int)$r['price'],'gradient'=>$r['gradient'],
    'emoji'=>$r['emoji'],'imageUrl'=>$r['image_url'],'flavors'=>jdec($r['flavors']),
    'sizes'=>jdec($r['sizes']),'allergens'=>jdec($r['allergens']),'details'=>jdec($r['allergens']),
    'containsNuts'=>(bool)$r['contains_nuts'],'stock'=>(int)$r['stock'],'sold'=>(int)$r['sold'],
    'featured'=>(bool)$r['featured'],'active'=>(bool)$r['active'],'sort'=>(int)$r['sort_order'],
    'color'=>($r['color'] ?? '') ?: '#C3201B','ink'=>($r['ink'] ?? '') ?: '#F3EDE0',
    'createdAt'=>(int)$r['created_at'],
  ];
}
function map_order(array $r): array {
  return [
    'id'=>$r['id'],'userId'=>$r['user_id'],'items'=>jdec($r['items']),'customer'=>jdec($r['customer'], (object)[]),
    'subtotal'=>(int)$r['subtotal'],'discount'=>(int)($r['discount'] ?? 0),'deliveryFee'=>(int)$r['delivery_fee'],'total'=>(int)$r['total'],
    'paymentMethod'=>$r['payment_method'],'status'=>$r['status'],'statusHistory'=>jdec($r['status_history']),
    'currency'=>($r['currency'] ?? '') ?: 'PKR',
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
  if (array_key_exists('details', $patch)) $patch['allergens'] = $patch['details'];
  if (isset($patch['sizes']) && is_array($patch['sizes'])) $patch['sizes'] = clean_sizes($patch['sizes']);
  // A bad colour is ignored rather than stored: it would draw a blank print.
  foreach (['color', 'ink'] as $k) if (array_key_exists($k, $patch)) {
    $hex = clean_hex($patch[$k]);
    if ($hex === '') unset($patch[$k]); else $patch[$k] = $hex;
  }
  foreach (['name' => 80, 'tagline' => 120, 'description' => 1200] as $k => $max)
    if (isset($patch[$k])) $patch[$k] = clean_text($patch[$k], $max);
  $m = array_merge($cur, $patch);
  if (!empty($m['sizes'][0]['price'])) $m['price'] = (int)$m['sizes'][0]['price'];
  $st = db()->prepare("UPDATE products SET slug=?, name=?, tagline=?, description=?, price=?, gradient=?, emoji=?,
    image_url=?, flavors=?, sizes=?, allergens=?, contains_nuts=?, stock=?, sold=?, featured=?, active=?, sort_order=?,
    color=?, ink=? WHERE id=?");
  $st->execute([$m['slug'],$m['name'],$m['tagline'],$m['description'],(int)$m['price'],$m['gradient'],$m['emoji'],
    $m['imageUrl'] ?? null, json_encode($m['flavors']), json_encode($m['sizes']), json_encode($m['allergens']),
    !empty($m['containsNuts'])?1:0, max(0, (int)$m['stock']), (int)$m['sold'], !empty($m['featured'])?1:0,
    !empty($m['active'])?1:0, (int)($m['sort'] ?? 0), $m['color'], $m['ink'], $id]);
  return product_get($id, true);
}
function product_create(array $d): array {
  $id = gen_id();
  $slug = $d['slug'] ?? strtolower(preg_replace('/[^a-z0-9]+/i', '-', trim($d['name'] ?? 'bandana')));
  $slug = trim($slug, '-') ?: 'bandana';
  if (isset($d['details'])) $d['allergens'] = $d['details'];
  $d['sizes'] = clean_sizes(!empty($d['sizes']) && is_array($d['sizes']) ? $d['sizes'] : bandana_sizes());
  // Slugs are URLs, so they must be unique: a second "Navy" becomes navy-2.
  $base = $slug; $n = 1;
  while (product_get($slug, true)) $slug = $base . '-' . (++$n);
  $color = clean_hex($d['color'] ?? '') ?: '#FF6A13';
  $ink   = clean_hex($d['ink'] ?? '') ?: '#FFFFFF';
  $st = db()->prepare("INSERT INTO products
    (id, slug, name, tagline, description, price, gradient, emoji, image_url,
     flavors, sizes, allergens, contains_nuts, stock, sold, featured, active, sort_order, created_at, color, ink)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)");
  $st->execute([$id, $slug, clean_text($d['name'] ?? 'New colour', 80), clean_text($d['tagline'] ?? '', 120), clean_text($d['description'] ?? '', 1200),
    (int)($d['sizes'][0]['price'] ?? $d['price'] ?? 0), $color, $d['emoji'] ?? '',
    $d['imageUrl'] ?? null, json_encode($d['flavors'] ?? []), json_encode($d['sizes'] ?? []),
    json_encode($d['allergens'] ?? bandana_details()), 0, max(0, (int)($d['stock'] ?? 0)), 0,
    !empty($d['featured'])?1:0, isset($d['active']) ? ((int)!!$d['active']) : 1, (int)($d['sort'] ?? 0), now_ms(), $color, $ink]);
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
  foreach (['name'=>80,'phone'=>30,'email'=>191,'address'=>300,'city'=>60,'postcode'=>20,'notes'=>300,'country'=>2] as $f=>$max)
    if (isset($customer[$f])) $customer[$f] = clean_text($customer[$f], $max);

  if (!$items) return ['error' => 'Your cart is empty.'];
  foreach (['name','phone','email','address','city'] as $f)
    if (empty($customer[$f])) return ['error' => 'Please provide your name, phone, email, address and city.'];
  if (!filter_var($customer['email'], FILTER_VALIDATE_EMAIL))
    return ['error' => 'Please enter a valid email address.'];
  $digits = preg_replace('/\D/', '', $customer['phone']);
  if (strlen($digits) < 7 || strlen($digits) > 15)
    return ['error' => 'Please enter a valid phone number.'];

  // Where it is going decides everything else: Pakistan is cash on delivery
  // in rupees; anywhere else is paid up front in dollars. A request with no
  // country is treated as Pakistan, which is what every order was before
  // worldwide shipping existed (an old cached checkout page sends none).
  $country = strtoupper(trim((string)($customer['country'] ?? ''))) ?: 'PK';
  if (country_name($country) === '') return ['error' => 'Please choose the country we should ship to.'];
  $domestic = is_domestic($country);
  $s = settings_get();
  if (!$domestic && empty($s['intlEnabled']))
    return ['error' => 'Sorry, we are only shipping within Pakistan right now.'];
  $rate = max(1, (int)$s['usdRate']);

  $email = strtolower(trim($customer['email']));

  // Note: the email is a contact address, not a proof of identity — checkout
  // is gated by the CAPTCHA in api/index.php instead of an emailed code. The
  // per-email, per-phone and per-IP limits below are what stop bulk ordering.

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

  $lineItems = []; $subtotal = 0; $need = [];
  foreach ($items as $it) {
    $p = product_get($it['productId'] ?? '');
    if (!$p) return ['error' => 'A product in your cart is no longer available.'];
    $qty = max(1, (int)($it['qty'] ?? 1));
    $size = ['label' => '', 'price' => $p['price']];
    if ($p['sizes']) {
      $size = null;
      foreach ($p['sizes'] as $sz) if (($sz['label'] ?? '') === ($it['size'] ?? '')) $size = $sz;
      if (!$size) $size = $p['sizes'][0];
    }
    // The price is always read from the catalogue, never from the request,
    // and in the currency of the destination.
    $unit = $domestic ? (int)$size['price'] : size_usd($size, $rate);
    $sizeLabel = (string)($size['label'] ?? '');
    $pieces = max(1, (int)($size['pieces'] ?? 1));
    $need[$p['id']] = ($need[$p['id']] ?? 0) + $qty * $pieces;
    if ($p['stock'] < $need[$p['id']]) {
      return ['error' => $p['stock'] > 0
        ? "Only {$p['stock']} {$p['name']} left — please choose a smaller quantity."
        : "{$p['name']} has just sold out."];
    }
    $lineTotal = $unit * $qty; $subtotal += $lineTotal;
    // The colours are copied in so a past order still draws the right
    // bandana after the product is edited or deleted.
    $lineItems[] = ['productId'=>$p['id'],'slug'=>$p['slug'],'name'=>$p['name'],'emoji'=>$p['emoji'],
      'color'=>$p['color'],'ink'=>$p['ink'],
      'size'=>$sizeLabel,'pieces'=>$pieces,'qty'=>$qty,'price'=>$unit,'lineTotal'=>$lineTotal];
  }
  // Everything that can reject the order must run BEFORE stock is committed,
  // otherwise a rejected order would silently eat inventory.
  if (empty($s['storeOpen'])) return ['error' => 'Sorry, we are currently not accepting orders. Please check back soon.'];
  $subtotalPkr = $domestic ? $subtotal : $subtotal * $rate;   // the cap is in rupees
  if ($subtotalPkr > $maxValue)
    return ['error' => 'For large orders please contact us directly so we can arrange it properly.'];

  // The buy-3 deal, across any mix of colours. Counted in bandanas.
  $units = 0; foreach ($lineItems as $li) $units += $li['qty'] * $li['pieces'];
  $discount = bundle_discount($units, $subtotal, $s);
  $afterDiscount = $subtotal - $discount;

  // commit stock
  foreach ($lineItems as $li) {
    $p = product_get($li['productId'], true);
    $units = $li['qty'] * $li['pieces'];
    product_update($p['id'], ['stock'=>$p['stock']-$units, 'sold'=>$p['sold']+$units]);
  }
  // Shipping: a flat courier fee inside Pakistan in rupees, a flat
  // international fee in dollars. Either is waived over its threshold; an
  // international threshold of 0 means it is never waived.
  // Thresholds compare what the customer actually pays for the bandanas,
  // after the deal, so the cart and the order agree to the rupee.
  if ($domestic) {
    $free = (int)$s['freeDeliveryOver'];
    $delivery = ($free > 0 && $afterDiscount >= $free) ? 0 : (int)$s['deliveryFee'];
  } else {
    $free = (int)$s['intlFreeOver'];
    $delivery = ($free > 0 && $afterDiscount >= $free) ? 0 : (int)$s['intlShipping'];
  }
  $currency = $domestic ? 'PKR' : 'USD';
  $method   = $domestic ? 'COD' : 'Prepaid';
  // An international order is not real until it is paid, so it waits there.
  $status   = $domestic ? 'Pending' : 'Awaiting Payment';
  $now = now_ms();
  $order = [
    'id'=>next_order_id(),'userId'=>$userId,'items'=>$lineItems,
    'customer'=>[
      'name'=>trim($customer['name']),'phone'=>trim($customer['phone']),
      'address'=>trim($customer['address']),'city'=>trim($customer['city']),
      'postcode'=>trim($customer['postcode'] ?? ''),
      'country'=>$country,'countryName'=>country_name($country),
      'notes'=>trim($customer['notes'] ?? ''),'email'=>trim($customer['email'] ?? ''),
    ],
    'subtotal'=>$subtotal,'discount'=>$discount,'deliveryFee'=>$delivery,'total'=>$afterDiscount+$delivery,'currency'=>$currency,
    'paymentMethod'=>$method,'status'=>$status,'statusHistory'=>[['status'=>$status,'at'=>$now]],
    'createdAt'=>$now,
  ];
  $st = db()->prepare("INSERT INTO orders (id,user_id,items,customer,subtotal,delivery_fee,total,payment_method,status,status_history,created_at,currency,discount)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)");
  $st->execute([$order['id'],$userId,json_encode($order['items']),json_encode($order['customer']),
    $order['subtotal'],$order['deliveryFee'],$order['total'],$method,$status,json_encode($order['statusHistory']),$now,$currency,$discount]);

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
    'order_count'=>$user['orders']+1,
    'total_spent'=>$user['totalSpent'] + ($domestic ? $order['total'] : $order['total'] * $rate),
    'last_order_at'=>$now,
  ]);
  if (!$userId) { db()->prepare("UPDATE orders SET user_id=? WHERE id=?")->execute([$user['id'],$order['id']]); $order['userId']=$user['id']; }

  // Count this IP only now that an order really exists.
  if ($ip !== '') rate_hit('order:' . $ip, $ip);

  // The owner's alert email is sent by the caller *after* the response has
  // been flushed. Doing it here made the customer wait on an SMTP round trip
  // to finish their checkout — and if the mail server is slow or unreachable,
  // that wait is measured in tens of seconds for an order that has already
  // been saved.
  return ['order' => $order];
}

// Email the shop owner when an order arrives (PHP mail, works on Hostinger).
// Set ORDER_NOTIFY_TO (or CONTACT_EMAIL) in .env to receive these.
function notify_order(array $o): void {
  $to = env('ORDER_NOTIFY_TO', env('CONTACT_EMAIL'));
  if (!$to) return;
  $usd = ($o['currency'] ?? 'PKR') === 'USD';
  $m = fn($n) => $usd ? '$' . number_format((float)$n) : 'Rs ' . number_format((float)$n);
  $lines = '';
  foreach ($o['items'] as $li)
    $lines .= "- {$li['qty']}x {$li['name']}" . ($li['size'] ? " ({$li['size']})" : '') . " - " . $m($li['lineTotal']) . "\n";
  $c = $o['customer'];
  $where = trim(($c['city'] ?? '') . ', ' . ($c['countryName'] ?? 'Pakistan'), ', ');
  $pay = $usd
    ? "PREPAID — send the customer a payment link, and only ship once it is paid."
    : "Cash on Delivery";
  $body = "New Fudgio order {$o['id']}\n\nName: {$c['name']}\nPhone: {$c['phone']}\nEmail: " . ($c['email'] ?? '') . "\n"
    . "Ship to: {$c['address']}, $where" . (!empty($c['postcode']) ? " {$c['postcode']}" : '') . "\n"
    . (!empty($c['notes']) ? "Notes: {$c['notes']}\n" : '')
    . "\nItems:\n$lines\nSubtotal: " . $m($o['subtotal'])
    . (!empty($o['discount']) ? "\nBundle discount: -" . $m($o['discount']) : '')
    . "\nShipping: " . ($o['deliveryFee'] == 0 ? 'FREE' : $m($o['deliveryFee']))
    . "\nTOTAL: " . $m($o['total']) . "\nPayment: $pay\n\nManage it in your admin dashboard.";
  send_mail($to, "New order {$o['id']} - " . $m($o['total']) . ($usd ? ' (international, prepaid)' : ' (COD)'), $body);
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
  if (!in_array($status, order_statuses(), true)) return ['error' => 'Invalid status.'];
  $o = order_get($id);
  if (!$o) return ['error' => 'Order not found.'];
  if ($status === 'Cancelled' && $o['status'] !== 'Cancelled') {
    foreach ($o['items'] as $li) {
      $p = product_get($li['productId'], true);
      $units = (int)$li['qty'] * max(1, (int)($li['pieces'] ?? 1));
      if ($p) product_update($p['id'], ['stock'=>$p['stock']+$units, 'sold'=>max(0,$p['sold']-$units)]);
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
      $units = (int)$li['qty'] * max(1, (int)($li['pieces'] ?? 1));
      if ($p) product_update($p['id'], ['stock'=>$p['stock']+$units, 'sold'=>max(0,$p['sold']-$units)]);
    }
  }
  db()->prepare("DELETE FROM orders WHERE id=?")->execute([$id]);
  return true;
}

/* ---------------- settings (store config editable from admin) ---------------- */
function settings_get(): array {
  $c = cfg();
  $defaults = [
    'deliveryFee'      => $c['deliveryFee'],         // Pakistan, PKR
    'freeDeliveryOver' => $c['freeDeliveryOver'],    // Pakistan, PKR
    'storeOpen'        => true,
    'announcement'     => '',
    // International orders. The owner asked for shipping of roughly $10–20.
    'intlEnabled'      => true,
    'intlShipping'     => (int) env('INTL_SHIPPING_USD', '12'),
    'intlFreeOver'     => (int) env('INTL_FREE_OVER_USD', '0'),   // 0 = never free
    // Rupees per dollar: converts a size with no USD price set, and reports
    // international revenue in rupees on the dashboard.
    'usdRate'          => (int) env('USD_RATE', '280'),
    // Where international customers pay: a PayPal.me, Wise or Payoneer link.
    'intlPaymentLink'  => (string) env('INTL_PAYMENT_LINK', ''),
    // The mix-and-match deal: this many bandanas or more take this % off.
    'bundleQty'        => (int) env('BUNDLE_QTY', '3'),
    'bundlePct'        => (int) env('BUNDLE_PCT', '15'),
    // How long delivery takes, as shown on the site. Text, so "2–4" works.
    'daysPk'           => (string) env('DELIVERY_DAYS_PK', '3–5'),
    'daysIntl'         => (string) env('DELIVERY_DAYS_INTL', '7–14'),
    // Social links for the footer and contact page. Blank hides them.
    'instagram'        => (string) env('INSTAGRAM', ''),
    'whatsapp'         => (string) env('WHATSAPP', ''),
  ];
  try {
    $row = db()->query("SELECT v FROM settings WHERE k='store'")->fetch();
    if ($row) return array_merge($defaults, jdec($row['v'], []));
  } catch (Throwable $e) {}
  return $defaults;
}
function settings_set(array $patch): array {
  $cur = settings_get();
  if (isset($patch['deliveryFee']))      $cur['deliveryFee']      = max(0, (int)$patch['deliveryFee']);
  if (isset($patch['freeDeliveryOver'])) $cur['freeDeliveryOver'] = max(0, (int)$patch['freeDeliveryOver']);
  if (isset($patch['storeOpen']))        $cur['storeOpen']        = !!$patch['storeOpen'];
  if (isset($patch['announcement']))     $cur['announcement']     = clean_text((string)$patch['announcement'], 200);
  if (isset($patch['intlEnabled']))      $cur['intlEnabled']      = !!$patch['intlEnabled'];
  if (isset($patch['intlShipping']))     $cur['intlShipping']     = max(0, (int)$patch['intlShipping']);
  if (isset($patch['intlFreeOver']))     $cur['intlFreeOver']     = max(0, (int)$patch['intlFreeOver']);
  if (isset($patch['usdRate']))          $cur['usdRate']          = max(1, (int)$patch['usdRate']);
  if (isset($patch['bundleQty']))        $cur['bundleQty']        = max(2, min(20, (int)$patch['bundleQty']));
  if (isset($patch['bundlePct']))        $cur['bundlePct']        = max(0, min(90, (int)$patch['bundlePct']));
  if (isset($patch['daysPk']))           $cur['daysPk']           = clean_text((string)$patch['daysPk'], 20);
  if (isset($patch['daysIntl']))         $cur['daysIntl']         = clean_text((string)$patch['daysIntl'], 20);
  if (isset($patch['instagram']))        $cur['instagram']        = instagram_handle((string)$patch['instagram']);
  if (isset($patch['whatsapp']))         $cur['whatsapp']         = preg_replace('/\D/', '', (string)$patch['whatsapp']);
  if (isset($patch['intlPaymentLink'])) {
    // Shown to customers as a link, so only an http(s) URL is accepted.
    $link = trim((string)$patch['intlPaymentLink']);
    $cur['intlPaymentLink'] = ($link === '' || preg_match('#^https?://[^\s"<>]+$#i', $link)) ? $link : $cur['intlPaymentLink'];
  }
  $v = json_encode($cur);
  if (db_driver()==='mysql') db()->prepare("INSERT INTO settings (k,v) VALUES ('store',?) ON DUPLICATE KEY UPDATE v=?")->execute([$v,$v]);
  else db()->prepare("INSERT OR REPLACE INTO settings (k,v) VALUES ('store',?)")->execute([$v]);
  return $cur;
}
/** "@fudgio", "fudgio" or an instagram.com URL, stored as the bare handle. */
function instagram_handle(string $v): string {
  $v = trim($v);
  if (preg_match('#instagram\.com/([A-Za-z0-9._]{1,30})#i', $v, $m)) $v = $m[1];
  $v = ltrim($v, '@');
  return preg_match('/^[A-Za-z0-9._]{1,30}$/', $v) ? $v : '';
}
function orders_csv(): string {
  $rows = orders_all();
  $out = "Order,Date,Name,Phone,Email,Country,City,Postcode,Address,Items,Currency,Discount,Total,Payment,Status\n";
  foreach ($rows as $o) {
    $items = implode('; ', array_map(fn($li)=>"{$li['qty']}x {$li['name']}".($li['size']?" ({$li['size']})":''), $o['items']));
    $c = $o['customer'];
    $cells = [$o['id'], date('Y-m-d H:i', (int)($o['createdAt']/1000)), $c['name']??'', $c['phone']??'', $c['email']??'',
      $c['countryName'] ?? 'Pakistan', $c['city']??'', $c['postcode']??'', $c['address']??'', $items,
      $o['currency'] ?? 'PKR', $o['discount'] ?? 0, $o['total'], $o['paymentMethod'], $o['status']];
    // A leading = + - @ makes a spreadsheet treat the cell as a formula; these
    // cells hold customer-typed text, so neutralise that before export.
    $cells = array_map(fn($x) => preg_match('/^[=+\-@]/', (string)$x) ? "'" . $x : $x, $cells);
    $out .= implode(',', array_map(fn($x)=>'"'.str_replace('"','""',(string)$x).'"', $cells)) . "\n";
  }
  return $out;
}

/* ---------------- newsletter ---------------- */
/** Adds an email to "get new colours first". Signing up twice is not an error. */
function subscriber_add(string $email, string $source): array {
  $email = strtolower(trim($email));
  if (strlen($email) > 191 || !filter_var($email, FILTER_VALIDATE_EMAIL)) return ['error' => 'Please enter a valid email address.'];
  $source = clean_text($source, 40) ?: 'site';
  $ins = db_driver() === 'mysql' ? 'INSERT IGNORE' : 'INSERT OR IGNORE';
  db()->prepare("$ins INTO subscribers (email, source, created_at) VALUES (?,?,?)")->execute([$email, $source, now_ms()]);
  return ['ok' => true];
}
function subscribers_all(): array {
  $rows = db()->query("SELECT email, source, created_at FROM subscribers ORDER BY created_at DESC")->fetchAll();
  return array_map(fn($r) => ['email' => $r['email'], 'source' => $r['source'], 'createdAt' => (int)$r['created_at']], $rows);
}
function subscriber_delete(string $email): bool {
  $st = db()->prepare("DELETE FROM subscribers WHERE email=?"); $st->execute([strtolower(trim($email))]);
  return $st->rowCount() > 0;
}
function subscribers_csv(): string {
  $out = "Email,Source,Signed up\n";
  foreach (subscribers_all() as $r)
    $out .= '"' . str_replace('"', '""', $r['email']) . '","' . $r['source'] . '","' . date('Y-m-d H:i', (int)($r['createdAt'] / 1000)) . "\"\n";
  return $out;
}

/* ---------------- contact messages ---------------- */
function message_topics(): array { return ['Order', 'Bulk or custom', 'Wholesale', 'Press', 'Other']; }
/** Saves a contact-form message. Returns the stored message or an error. */
function message_create(array $b): array {
  $m = [
    'name'  => clean_text($b['name'] ?? '', 120),
    'email' => strtolower(clean_text($b['email'] ?? '', 191)),
    'phone' => clean_text($b['phone'] ?? '', 40),
    'topic' => clean_text($b['topic'] ?? '', 60),
    'body'  => clean_text($b['message'] ?? '', 3000),
  ];
  if ($m['name'] === '' || $m['body'] === '') return ['error' => 'Please add your name and a message.'];
  if (!filter_var($m['email'], FILTER_VALIDATE_EMAIL)) return ['error' => 'Please enter a valid email address so we can reply.'];
  if (!in_array($m['topic'], message_topics(), true)) $m['topic'] = 'Other';
  $m['id'] = gen_id(); $m['status'] = 'new'; $m['createdAt'] = now_ms();
  db()->prepare("INSERT INTO messages (id,name,email,phone,topic,body,status,created_at) VALUES (?,?,?,?,?,?,?,?)")
     ->execute([$m['id'], $m['name'], $m['email'], $m['phone'], $m['topic'], $m['body'], 'new', $m['createdAt']]);
  return ['message' => $m];
}
function messages_all(): array {
  $rows = db()->query("SELECT * FROM messages ORDER BY created_at DESC")->fetchAll();
  return array_map(fn($r) => ['id'=>$r['id'],'name'=>$r['name'],'email'=>$r['email'],'phone'=>$r['phone'],
    'topic'=>$r['topic'],'body'=>$r['body'],'status'=>$r['status'],'createdAt'=>(int)$r['created_at']], $rows);
}
function message_set_status(string $id, string $status): bool {
  if (!in_array($status, ['new', 'read', 'done'], true)) return false;
  $st = db()->prepare("UPDATE messages SET status=? WHERE id=?"); $st->execute([$status, $id]);
  return $st->rowCount() > 0;
}
function message_delete(string $id): bool {
  $st = db()->prepare("DELETE FROM messages WHERE id=?"); $st->execute([$id]);
  return $st->rowCount() > 0;
}
/** Emails the shop a copy of a contact message, with Reply-To set to the sender. */
function notify_message(array $m): void {
  $to = env('ORDER_NOTIFY_TO', env('CONTACT_EMAIL'));
  if (!$to) return;
  $body = "New message from the Fudgio contact form\n\nName: {$m['name']}\nEmail: {$m['email']}\n"
    . ($m['phone'] !== '' ? "Phone: {$m['phone']}\n" : '') . "Topic: {$m['topic']}\n\n{$m['body']}\n\nReply to this email to answer them.";
  send_mail($to, "Fudgio message: {$m['topic']} from {$m['name']}", $body, '', $m['email']);
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

/* ---------------- CAPTCHA ----------------
   A self-contained image challenge, used to keep automated bulk ordering off
   the checkout. Deliberately not reCAPTCHA: that needs a project id and API
   key to verify server-side, and without them the check silently passes,
   which is worse than no check at all because it looks like protection.

   The answer is never sent to the browser. The image is generated once,
   returned inline as a data URI, and only a hash of the answer is stored, so
   there is no plaintext code sitting in the database and no second endpoint
   that could be used to fish for one. Each challenge is single use.
   ---------------------------------------------------------------------- */

/** Characters that cannot be confused with each other once distorted. */
const CAPTCHA_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CAPTCHA_LEN      = 5;
const CAPTCHA_TTL_MS   = 10 * 60 * 1000;

function captcha_table(): void {
  db()->exec("CREATE TABLE IF NOT EXISTS captcha (
    id VARCHAR(40) PRIMARY KEY, answer_hash VARCHAR(80), expires_at BIGINT,
    attempts INT DEFAULT 0, used INT DEFAULT 0, created_at BIGINT)");
}

/**
 * Issues a challenge. Returns ['id' => ..., 'image' => 'data:image/png;...'].
 * Returns ['error' => ...] when the caller is asking for them too quickly.
 */
function captcha_create(string $ip): array {
  captcha_table();

  // One machine should not be able to pull thousands of challenges looking
  // for one it has already solved, or just to burn CPU drawing images.
  if ($ip !== '' && rate_count('captcha:' . $ip, 3600000) >= (int) env('MAX_CAPTCHA_PER_IP', '120'))
    return ['error' => 'Too many attempts. Please try again later.'];
  if ($ip !== '') rate_hit('captcha:' . $ip, $ip);

  $code = '';
  $max = strlen(CAPTCHA_ALPHABET) - 1;
  for ($i = 0; $i < CAPTCHA_LEN; $i++) $code .= CAPTCHA_ALPHABET[random_int(0, $max)];

  $id  = gen_id();
  $now = now_ms();
  db()->prepare("INSERT INTO captcha (id, answer_hash, expires_at, attempts, used, created_at) VALUES (?,?,?,0,0,?)")
     ->execute([$id, captcha_hash($code), $now + CAPTCHA_TTL_MS, $now]);

  // Opportunistic cleanup so the table cannot grow without bound.
  try { db()->prepare("DELETE FROM captcha WHERE expires_at < ?")->execute([$now - 3600000]); } catch (Throwable $e) {}

  return ['id' => $id, 'image' => captcha_image_data($code)];
}

/** Answers are compared case-insensitively, so hash the normalised form. */
function captcha_hash(string $code): string {
  return hash('sha256', strtoupper(trim($code)) . '|' . env('COOKIE_SECRET', 'fudgio-captcha'));
}

/**
 * Checks an answer and consumes the challenge. Every outcome invalidates it —
 * a wrong answer cannot be retried against the same image.
 */
function captcha_check(string $id, string $answer): array {
  captcha_table();
  $id = trim($id);
  $answer = strtoupper(preg_replace('/[^A-Za-z0-9]/', '', $answer));
  if ($id === '' || $answer === '') return ['error' => 'Please enter the code from the image.'];

  $st = db()->prepare("SELECT * FROM captcha WHERE id=? LIMIT 1");
  $st->execute([$id]);
  $row = $st->fetch();
  if (!$row)                                    return ['error' => 'That code has expired. Please try the new image.'];
  if ((int)$row['used'] === 1)                  return ['error' => 'That code has already been used. Please try the new image.'];
  if (now_ms() > (int)$row['expires_at'])       return ['error' => 'That code has expired. Please try the new image.'];

  // Consume it either way, so a single image can never be brute-forced.
  db()->prepare("UPDATE captcha SET used=1, attempts=attempts+1 WHERE id=?")->execute([$id]);

  if (!hash_equals((string)$row['answer_hash'], captcha_hash($answer)))
    return ['error' => 'That code was not correct. Please try the new image.'];

  return ['ok' => true];
}

/**
 * Draws the challenge and returns it as a PNG data URI.
 *
 * Each character is drawn into its own small canvas with a built-in GD font,
 * scaled up and rotated before being pasted down. That gives per-character
 * distortion without needing a TTF file on the server, which shared hosting
 * cannot be relied on to have.
 */
function captcha_image_data(string $code): string {
  $w = 220; $h = 70;
  if (!function_exists('imagecreatetruecolor')) return '';   // no GD: caller falls back

  $im = imagecreatetruecolor($w, $h);
  $white  = imagecolorallocate($im, 255, 255, 255);
  imagefilledrectangle($im, 0, 0, $w, $h, $white);

  // Brand-coloured speckle, light enough to leave the characters readable.
  $orange = imagecolorallocate($im, 255, 106, 19);
  $pink   = imagecolorallocate($im, 255, 46, 136);
  for ($i = 0; $i < 260; $i++) {
    imagesetpixel($im, random_int(0, $w - 1), random_int(0, $h - 1), random_int(0, 1) ? $orange : $pink);
  }
  for ($i = 0; $i < 3; $i++) {
    imageline($im, random_int(0, 30), random_int(0, $h), random_int($w - 30, $w), random_int(0, $h),
      random_int(0, 1) ? $orange : $pink);
  }

  $black = imagecolorallocate($im, 11, 10, 10);
  $slotW = (int) floor(($w - 24) / CAPTCHA_LEN);

  // Built-in font 5 draws a glyph at exactly 9x15px, so the tile is sized to
  // that: any larger and the character ends up as a small mark floating in a
  // mostly-empty tile once it is scaled up.
  for ($i = 0; $i < CAPTCHA_LEN; $i++) {
    $ch = $code[$i];
    $tw = 9; $th = 15;
    $tile = imagecreatetruecolor($tw, $th);
    $tbg = imagecolorallocate($tile, 255, 0, 255);          // magenta = the key colour
    imagefilledrectangle($tile, 0, 0, $tw, $th, $tbg);
    imagecolortransparent($tile, $tbg);
    $tfg = imagecolorallocate($tile, 11, 10, 10);
    imagestring($tile, 5, 0, 0, $ch, $tfg);                 // built-in font, no TTF needed

    // Scale up, then rotate. Nearest-neighbour (imagecopyresized) keeps the
    // strokes solid; resampling at this ratio turns them into grey mush.
    $sw = 38; $sh = 56;
    $big = imagecreatetruecolor($sw, $sh);
    $bbg = imagecolorallocate($big, 255, 0, 255);
    imagefilledrectangle($big, 0, 0, $sw, $sh, $bbg);
    imagecolortransparent($big, $bbg);
    imagecopyresized($big, $tile, 0, 0, 0, 0, $sw, $sh, $tw, $th);

    $rot = imagerotate($big, random_int(-22, 22), $bbg);
    imagecolortransparent($rot, $bbg);

    $x = 10 + $i * $slotW + random_int(-2, 2);
    $y = (int) (($h - imagesy($rot)) / 2) + random_int(-4, 4);
    imagecopy($im, $rot, $x, $y, 0, 0, imagesx($rot), imagesy($rot));

    imagedestroy($tile); imagedestroy($big); imagedestroy($rot);
  }

  // One thin stroke over the glyphs, to frustrate naive segmenting without
  // making the code itself hard for a person to read.
  imageline($im, 0, random_int(16, $h - 16), $w, random_int(16, $h - 16), $black);

  ob_start();
  imagepng($im);
  $png = ob_get_clean();
  imagedestroy($im);
  return 'data:image/png;base64,' . base64_encode($png);
}

/* ---------------- phone verification (SMS) ----------------
   Email codes were reaching spam and, for this shop's customers, a phone is
   simply the more reliable channel. The code is stored hashed and the number
   is normalised to E.164 first, so 0300-1234567 and +92 300 1234567 are the
   same record rather than two.

   Sending an SMS costs money, which makes /api/verify/phone/send a target
   worth abusing on its own. It is CAPTCHA-gated in index.php, and the caps
   below bound the damage per number and per IP even if that is defeated.
   -------------------------------------------------------------------- */

function phone_otp_table(): void {
  db()->exec("CREATE TABLE IF NOT EXISTS phone_otp (
    phone VARCHAR(24) PRIMARY KEY, code_hash VARCHAR(255), expires_at BIGINT,
    attempts INT DEFAULT 0, sends INT DEFAULT 0, last_sent BIGINT,
    verified_at BIGINT, created_at BIGINT)");
}

function phone_otp_row(string $e164): ?array {
  phone_otp_table();
  $st = db()->prepare("SELECT * FROM phone_otp WHERE phone=? LIMIT 1");
  $st->execute([$e164]);
  return $st->fetch() ?: null;
}

/** Sends a fresh code. Returns ['ok'=>true] or ['error'=>...]. */
function phone_otp_send(string $phone, string $ip): array {
  $e164 = sms_normalise($phone);
  if ($e164 === '') return ['error' => 'Please enter a valid Pakistani mobile number, like 0300 1234567.'];
  if (!sms_ready())  return ['error' => 'Phone verification is not available right now. Please contact us to order.'];

  phone_otp_table();
  $now = now_ms();
  $row = phone_otp_row($e164);

  if ($row) {
    if ($row['last_sent'] !== null && $now - (int)$row['last_sent'] < 60000)
      return ['error' => 'Please wait a minute before asking for another code.'];
    if ((int)$row['sends'] >= (int) env('MAX_SMS_PER_NUMBER', '8') && $now - (int)$row['created_at'] < 86400000)
      return ['error' => 'Too many codes sent to this number today. Please try again tomorrow or contact us.'];
  }
  // Per-IP cap, so one machine cannot spray codes at many different numbers.
  if ($ip !== '' && rate_count('sms:' . $ip, 3600000) >= (int) env('MAX_SMS_PER_IP', '20'))
    return ['error' => 'Too many verification attempts. Please try again later.'];
  if ($ip !== '') rate_hit('sms:' . $ip, $ip);

  $code = str_pad((string) random_int(0, 99999), 5, '0', STR_PAD_LEFT);
  $expires = $now + 10 * 60 * 1000;
  $brand = cfg()['brandName'];
  $text = $code . ' is your ' . $brand . ' order verification code. It expires in 10 minutes.';

  [$ok, $err] = sms_send($e164, $text);
  if (!$ok) {
    error_log('Fudgio SMS send failed to ' . $e164 . ': ' . $err);
    return ['error' => 'We could not send the code right now. Please try again in a moment.'];
  }

  $hash = password_hash($code, PASSWORD_BCRYPT);
  if ($row) {
    db()->prepare("UPDATE phone_otp SET code_hash=?, expires_at=?, attempts=0, sends=sends+1, last_sent=?, verified_at=NULL WHERE phone=?")
       ->execute([$hash, $expires, $now, $e164]);
  } else {
    db()->prepare("INSERT INTO phone_otp (phone,code_hash,expires_at,attempts,sends,last_sent,verified_at,created_at) VALUES (?,?,?,0,1,?,NULL,?)")
       ->execute([$e164, $hash, $expires, $now, $now]);
  }
  return ['ok' => true, 'phone' => $e164];
}

/** Confirms a code. Wrong guesses are counted and capped. */
function phone_otp_check(string $phone, string $code): array {
  $e164 = sms_normalise($phone);
  if ($e164 === '') return ['error' => 'Please enter a valid Pakistani mobile number.'];
  $row = phone_otp_row($e164);
  if (!$row)                                return ['error' => 'Please ask for a code first.'];
  if ((int)$row['attempts'] >= 6)           return ['error' => 'Too many incorrect attempts. Please ask for a new code.'];
  if (now_ms() > (int)$row['expires_at'])   return ['error' => 'That code has expired. Please ask for a new one.'];

  db()->prepare("UPDATE phone_otp SET attempts=attempts+1 WHERE phone=?")->execute([$e164]);
  if (!password_verify(trim($code), (string)$row['code_hash']))
    return ['error' => 'That code is not correct. Please check and try again.'];

  db()->prepare("UPDATE phone_otp SET verified_at=?, attempts=0 WHERE phone=?")->execute([now_ms(), $e164]);
  return ['ok' => true];
}

/** A number counts as verified for a short window after confirming a code. */
function phone_is_verified(string $phone): bool {
  $e164 = sms_normalise($phone);
  if ($e164 === '') return false;
  $row = phone_otp_row($e164);
  if (!$row || $row['verified_at'] === null) return false;
  return (now_ms() - (int)$row['verified_at']) < 30 * 60 * 1000;   // 30 minutes
}

/** Single-use: clears the confirmation once an order has been placed on it. */
function phone_otp_consume(string $phone): void {
  $e164 = sms_normalise($phone);
  if ($e164 === '') return;
  try {
    db()->prepare("UPDATE phone_otp SET verified_at=NULL, code_hash='', expires_at=0 WHERE phone=?")
       ->execute([$e164]);
  } catch (Throwable $e) { /* never block an order that already succeeded */ }
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
  $rate = max(1, (int) settings_get()['usdRate']);
  // Orders arrive in two currencies. Everything summed across orders is in
  // rupees, converting dollars at the admin's rate; the dollar and rupee
  // figures are also reported separately so nothing is hidden by the rate.
  $pkr = fn(array $o, $amount) => ($o['currency'] ?? 'PKR') === 'USD' ? $amount * $rate : $amount;

  // Revenue counts orders that are going ahead. An international order that
  // has not been paid yet is not revenue, and neither is a cancelled one.
  $active    = array_values(array_filter($orders, fn($o)=>!in_array($o['status'], ['Cancelled','Awaiting Payment'], true)));
  $awaiting  = array_values(array_filter($orders, fn($o)=>$o['status']==='Awaiting Payment'));
  $delivered = array_values(array_filter($orders, fn($o)=>$o['status']==='Delivered'));
  $revenue = 0; $revenuePkr = 0; $revenueUsd = 0;
  foreach ($active as $o) {
    $revenue += $pkr($o, $o['total']);
    if (($o['currency'] ?? 'PKR') === 'USD') $revenueUsd += $o['total']; else $revenuePkr += $o['total'];
  }
  $awaitingUsd = array_sum(array_map(fn($o)=>$o['total'], $awaiting));

  $per = []; $units = 0;
  foreach ($active as $o) foreach ($o['items'] as $li) {
    $k = $li['productId'];
    $n = (int)$li['qty'] * max(1, (int)($li['pieces'] ?? 1));   // bandanas, not packs
    if (!isset($per[$k])) $per[$k] = ['name'=>$li['name'],'emoji'=>$li['emoji'],'color'=>$li['color'] ?? null,'units'=>0,'revenue'=>0];
    $per[$k]['units'] += $n; $per[$k]['revenue'] += $pkr($o, $li['lineTotal']);
    $units += $n;
  }
  $top = array_values($per); usort($top, fn($a,$b)=>$b['units']-$a['units']);

  $days = [];
  for ($i=13;$i>=0;$i--) {
    $start = strtotime("today -$i days")*1000; $end=$start+86400000;
    $dayOrders = array_filter($active, fn($o)=>$o['createdAt']>=$start && $o['createdAt']<$end);
    $days[] = ['label'=>date('M j', (int)($start/1000)),'orders'=>count($dayOrders),
      'revenue'=>array_sum(array_map(fn($o)=>$pkr($o, $o['total']),$dayOrders))];
  }

  // Where orders are going: the city inside Pakistan, the country outside it.
  $places = []; $countries = [];
  foreach ($active as $o) {
    $c = $o['customer'];
    $intl = !is_domestic((string)($c['country'] ?? 'PK'));
    $place = $intl ? ($c['countryName'] ?? $c['country'] ?? 'Abroad') : (($c['city'] ?? '') ?: 'Unknown');
    $places[$place] = ($places[$place] ?? 0) + 1;
    $cn = $c['countryName'] ?? 'Pakistan';
    $countries[$cn] = ($countries[$cn] ?? 0) + 1;
  }
  arsort($places); arsort($countries);
  $cityBreakdown = []; foreach ($places as $city=>$n) $cityBreakdown[] = ['city'=>$city,'count'=>$n];
  $countryBreakdown = []; foreach ($countries as $cn=>$n) $countryBreakdown[] = ['country'=>$cn,'count'=>$n];

  $statusCounts = [];
  foreach ($orders as $o) $statusCounts[$o['status']]=($statusCounts[$o['status']]??0)+1;

  $lowStock = [];
  foreach ($products as $p) if ($p['active'] && $p['stock']<=10) $lowStock[]=['id'=>$p['id'],'name'=>$p['name'],'stock'=>$p['stock'],'emoji'=>$p['emoji'],'color'=>$p['color'],'ink'=>$p['ink']];
  usort($lowStock, fn($a,$b)=>$a['stock']-$b['stock']);

  $activeProducts = array_filter($products, fn($p)=>$p['active']);
  $intlOrders = count(array_filter($orders, fn($o)=>($o['currency'] ?? 'PKR')==='USD'));
  $bundleOrders = count(array_filter($active, fn($o)=>!empty($o['discount'])));
  $subs = 0; $unread = 0;
  try { $subs = (int) db()->query("SELECT COUNT(*) c FROM subscribers")->fetch()['c']; } catch (Throwable $e) {}
  try { $unread = (int) db()->query("SELECT COUNT(*) c FROM messages WHERE status='new'")->fetch()['c']; } catch (Throwable $e) {}
  $vs = visit_stats();

  return [
    'visits'=>$vs,
    'totals'=>[
      'revenue'=>$revenue,'revenuePkr'=>$revenuePkr,'revenueUsd'=>$revenueUsd,'usdRate'=>$rate,
      'orders'=>count($orders),'activeOrders'=>count($active),'intlOrders'=>$intlOrders,
      'bundleOrders'=>$bundleOrders,'subscribers'=>$subs,'unreadMessages'=>$unread,
      'awaitingPayment'=>count($awaiting),'awaitingPaymentUsd'=>$awaitingUsd,
      'cancelledOrders'=>count(array_filter($orders, fn($o)=>$o['status']==='Cancelled')),
      'deliveredOrders'=>count($delivered),
      'customers'=>count($users),'unitsSold'=>$units,
      'avgOrderValue'=>count($active)?(int)round($revenue/count($active)):0,
      'products'=>count($activeProducts),
      'outOfStock'=>count(array_filter($products, fn($p)=>$p['active']&&$p['stock']===0)),
      'pendingOrders'=>count(array_filter($orders, fn($o)=>in_array($o['status'], open_statuses(), true))),
      'pageViews'=>$vs['totalViews'], 'visitors'=>$vs['uniqueVisitors'], 'viewsToday'=>$vs['viewsToday'], 'visitorsToday'=>$vs['visitorsToday'],
    ],
    'topProducts'=>$top,'salesByDay'=>$days,'cityBreakdown'=>$cityBreakdown,'countryBreakdown'=>$countryBreakdown,
    'statusCounts'=>(object)$statusCounts,'lowStock'=>$lowStock,
  ];
}
