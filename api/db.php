<?php
// Fudgio data layer (PHP + PDO). Connects to MySQL (your Google Cloud SQL /
// Hostinger MySQL) when DB_HOST is set in .env, otherwise falls back to a local
// SQLite file so the app still runs for development. Mirrors the Node schema.
declare(strict_types=1);

/* ---------------- .env loader (shares the project's .env) ---------------- */
function env_all(): array {
  static $env = null;
  if ($env !== null) return $env;
  $env = [];
  $file = __DIR__ . '/../.env';
  if (is_file($file)) {
    foreach (file($file, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
      $line = trim($line);
      if ($line === '' || $line[0] === '#') continue;
      $eq = strpos($line, '=');
      if ($eq === false) continue;
      $k = trim(substr($line, 0, $eq));
      $v = trim(substr($line, $eq + 1));
      if ((str_starts_with($v, '"') && str_ends_with($v, '"')) ||
          (str_starts_with($v, "'") && str_ends_with($v, "'"))) $v = substr($v, 1, -1);
      $env[$k] = $v;
    }
  }
  // Real environment variables win over the file.
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
  $pdo->exec("CREATE TABLE IF NOT EXISTS counters (name VARCHAR(40) PRIMARY KEY, value BIGINT)");
  $pdo->exec("INSERT " . ($driver === 'mysql' ? 'IGNORE ' : 'OR IGNORE ') .
             "INTO counters (name, value) VALUES ('orderSeq', 1000)");

  $count = (int) $pdo->query("SELECT COUNT(*) AS c FROM products")->fetch()['c'];
  if ($count === 0) db_seed($pdo);
}

function db_seed(PDO $pdo): void {
  $now = now_ms();
  $catalog = [
    ['chocolate', 'Classic Chocolate', 'The original, impossibly fudgy',
     'Dense, gooey and deeply chocolatey with a crackly, paper-thin top. Made from our secret small-batch recipe using premium dark chocolate and real butter.',
     900, 'linear-gradient(135deg,#5b3a29,#2b1a12)', '🍫',
     [['label'=>'Box of 6','price'=>900],['label'=>'Box of 9','price'=>1290],['label'=>'Box of 12','price'=>1650]],
     ['Gluten (wheat)','Dairy','Eggs','Soy'], 0, 60, 0],
    ['nutty-delight', 'Nutty Delight', 'Loaded with toasted nuts',
     'A rich chocolate brownie packed with roasted walnuts and hazelnuts for a satisfying crunch in every bite. Made from our secret small-batch recipe.',
     1050, 'linear-gradient(135deg,#6d4c2f,#3a2417)', '🌰',
     [['label'=>'Box of 6','price'=>1050],['label'=>'Box of 9','price'=>1490],['label'=>'Box of 12','price'=>1920]],
     ['Tree nuts (walnut, hazelnut)','Gluten (wheat)','Dairy','Eggs','Soy'], 1, 45, 1],
    ['salted-caramel', 'Salted Caramel', 'Sweet, salty, unforgettable',
     'Ribbons of golden salted caramel swirled through a fudgy chocolate brownie and finished with a pinch of flaky sea salt. Made from our secret small-batch recipe.',
     1050, 'linear-gradient(135deg,#a06a34,#3b230f)', '🍯',
     [['label'=>'Box of 6','price'=>1050],['label'=>'Box of 9','price'=>1490],['label'=>'Box of 12','price'=>1920]],
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
function next_order_id(): string {
  db()->exec("UPDATE counters SET value = value + 1 WHERE name='orderSeq'");
  $v = db()->query("SELECT value FROM counters WHERE name='orderSeq'")->fetch()['value'];
  return 'FUD-' . $v;
}
function order_create(array $items, array $customer, ?string $userId): array {
  if (!$items) return ['error' => 'Your cart is empty.'];
  foreach (['name','phone','email','address','city'] as $f)
    if (empty($customer[$f])) return ['error' => 'Please provide your name, phone, email, address and city.'];
  if (!filter_var($customer['email'], FILTER_VALIDATE_EMAIL))
    return ['error' => 'Please enter a valid email address.'];
  $digits = preg_replace('/\D/', '', $customer['phone']);
  if (strlen($digits) < 10 || strlen($digits) > 15)
    return ['error' => 'Please enter a valid phone number.'];

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
  // commit stock
  foreach ($lineItems as $li) {
    $p = product_get($li['productId'], true);
    product_update($p['id'], ['stock'=>$p['stock']-$li['qty'], 'sold'=>$p['sold']+$li['qty']]);
  }
  $s = settings_get();
  if (empty($s['storeOpen'])) return ['error' => 'Sorry, we are currently not accepting orders. Please check back soon.'];
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
  $from = env('SMTP_FROM', 'orders@' . preg_replace('#^https?://#', '', cfg()['siteUrl']));
  $headers = "From: Fudgio Orders <$from>\r\nContent-Type: text/plain; charset=UTF-8";
  @mail($to, "New order {$o['id']} - $cur " . number_format($o['total']) . ' (COD)', $body, $headers);
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

/* ---------------- visitor tracking ---------------- */
function record_visit(string $page, string $visitor, string $ip, string $ref, string $ua): void {
  try {
    $st = db()->prepare("INSERT INTO visits (id,visitor,page,ip,referrer,ua,created_at) VALUES (?,?,?,?,?,?,?)");
    $st->execute([gen_id(), substr($visitor,0,40), substr($page,0,191), substr($ip,0,64), substr($ref,0,255), substr($ua,0,255), now_ms()]);
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
