<?php
// Fudgio API front-controller. All /api/* requests route here (see .htaccess).
declare(strict_types=1);
require_once __DIR__ . '/db.php';

ini_set('session.cookie_lifetime', (string)(60*60*24*30));
ini_set('session.gc_maxlifetime', (string)(60*60*24*30));
$https = (($_SERVER['HTTPS'] ?? '') !== '' && ($_SERVER['HTTPS'] ?? '') !== 'off')
      || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
session_set_cookie_params(['lifetime'=>60*60*24*30,'path'=>'/','httponly'=>true,'secure'=>$https,'samesite'=>'Lax']);
session_start();

header('Content-Type: application/json');
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: strict-origin-when-cross-origin');
header('Cache-Control: no-store');
header_remove('X-Powered-By');
// CORS so the admin subdomain (admin.fudgio.com) can call this API.
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if (preg_match('#^https?://([a-z0-9-]+\.)?fudgio\.com$#i', $origin) || $origin==='') {
  if ($origin) header("Access-Control-Allow-Origin: $origin");
  header('Access-Control-Allow-Credentials: true');
}
header('Access-Control-Allow-Headers: Content-Type, x-admin-token');
header('Access-Control-Allow-Methods: GET, POST, PATCH, PUT, DELETE, OPTIONS');
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') { http_response_code(204); exit; }

// Read the JSON body, refusing anything oversized so a huge POST can't be used
// to exhaust memory. Admin image uploads pass a larger limit explicitly.
function body(int $maxBytes = 262144): array {
  $raw = file_get_contents('php://input', false, null, 0, $maxBytes + 1);
  if ($raw === false) return [];
  if (strlen($raw) > $maxBytes) err('Request too large.', 413);
  $j = json_decode($raw, true, 32);
  return is_array($j) ? $j : [];
}
function out($d, int $code=200){ http_response_code($code); echo json_encode($d); exit; }
function err(string $m, int $code=400){ out(['error'=>$m], $code); }
// Simple per-IP throttle for an endpoint. Returns nothing; exits on limit.
function throttle(string $bucket, int $max, int $windowMs){
  $ip = client_ip(); if ($ip === '') return;
  if (rate_count($bucket.':'.$ip, $windowMs) >= $max) err('Too many requests. Please slow down and try again shortly.', 429);
  rate_hit($bucket.':'.$ip, $ip);
}
function client_ip(){ $ip = $_SERVER['HTTP_X_FORWARDED_FOR'] ?? $_SERVER['REMOTE_ADDR'] ?? ''; return trim(explode(',', $ip)[0]); }
function ip_allowed(){ $allow = env('ADMIN_ALLOW_IP'); if(!$allow) return true; $ip=client_ip(); foreach(explode(',',$allow) as $a){ if(trim($a)!=='' && trim($a)===$ip) return true; } return false; }
function require_admin(){
  if(!ip_allowed()) err('Forbidden: this device is not allowed to access the admin.',403);
  $t=(string)($_SERVER['HTTP_X_ADMIN_TOKEN'] ?? ($_GET['token']??''));
  if(!hash_equals(cfg()['adminToken'], $t)) err('Unauthorized.',401);
}
function current_user(): ?array { return isset($_SESSION['uid']) ? user_by_id($_SESSION['uid']) : null; }
function public_user(?array $u): ?array { return $u ? ['id'=>$u['id'],'name'=>$u['name'],'email'=>$u['email'],'phone'=>$u['phone'],'avatarUrl'=>$u['avatarUrl']??null,'city'=>$u['city'],'address'=>$u['address'],'orders'=>$u['orders'],'totalSpent'=>$u['totalSpent']] : null; }

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?? '/';
$path = preg_replace('#^.*/api/?#', '', $path);        // strip everything up to /api/
$path = trim($path, '/');
$seg = $path === '' ? [] : explode('/', $path);

try {
  // ---- health ----
  if ($path==='health' || $path==='healthz') {
    $envPath = dirname(__DIR__).'/.env';
    $r = ['ok'=>true, 'driver'=>db_driver(), 'time'=>date('c'),
      'envExpectedAt'=>$envPath, 'envFileFound'=>is_file($envPath), 'dbHostSet'=>(bool)env('DB_HOST')];
    try {
      $r['orders'] = (int) db()->query("SELECT COUNT(*) c FROM orders")->fetch()['c'];
      $r['products'] = (int) db()->query("SELECT COUNT(*) c FROM products")->fetch()['c'];
      $r['visits'] = (int) db()->query("SELECT COUNT(*) c FROM visits")->fetch()['c'];
    } catch (Throwable $e) { $r['dbError'] = $e->getMessage(); }
    if (db_driver()==='sqlite') {
      $p = $GLOBALS['__fudgio_sqlite'] ?? '';
      $r['sqlitePath'] = $p; $r['sqliteExists'] = $p && is_file($p);
      $r['sqliteSizeBytes'] = ($p && is_file($p)) ? filesize($p) : 0;
    }
    out($r);
  }
  if ($path==='config') out(['statuses'=>['Pending','Confirmed','Baking','Out for Delivery','Delivered','Cancelled'],'currency'=>cfg()['currency']]);

  // Public: everything the storefront needs to render correct totals.
  // The delivery fee and free-delivery threshold live in the admin, and
  // order_create() charges from those values — so the shop has to read them
  // from here rather than hardcode a copy, or the cart would quote one total
  // and the customer be charged another.
  if (($path==='announcement' || $path==='storefront') && $method==='GET') {
    $s = settings_get();
    out([
      'announcement'     => $s['announcement'] ?? '',
      'storeOpen'        => (bool)($s['storeOpen'] ?? true),
      'deliveryFee'      => (int)($s['deliveryFee'] ?? cfg()['deliveryFee']),
      'freeDeliveryOver' => (int)($s['freeDeliveryOver'] ?? cfg()['freeDeliveryOver']),
      'currency'         => cfg()['currency'],
    ]);
  }

  // Public: record a page visit (fire-and-forget from the storefront).
  if ($path==='visit' && $method==='POST') {
    // Cheap flood guard so nobody can inflate the analytics table.
    $vip = client_ip();
    if ($vip !== '') {
      if (rate_count('visit:'.$vip, 3600000) >= 200) out(['ok'=>true]);
      rate_hit('visit:'.$vip, $vip);
    }
    $b = body(8192);
    record_visit($b['page'] ?? '/', $b['visitor'] ?? '', client_ip(), $_SERVER['HTTP_REFERER'] ?? '', $_SERVER['HTTP_USER_AGENT'] ?? '');
    out(['ok'=>true]);
  }

  // ---- mail diagnostics (admin only) ----
  // /api/diag/mail?token=<admin password>&to=you@example.com
  // Reports what the mail settings look like and the real error from every
  // delivery attempt, so a failing code send can be fixed instead of guessed at.
  if ($seg[0]==='diag' && ($seg[1]??'')==='mail') {
    require_admin();
    $c = smtp_config();
    $r = [
      'smtpHost'    => $c['host'] ?: '(not set)',
      'smtpPort'    => $c['port'],
      'smtpSecure'  => $c['secure'],
      'smtpUser'    => $c['user'] ?: '(not set)',
      'smtpFrom'    => $c['from'] ?: '(not set)',
      'passwordSet' => $c['pass'] !== '',      // never echo the password itself
      'passwordLen' => strlen($c['pass']),
      'smtpReady'   => smtp_ready(),
      'envLocalFound' => is_file(dirname(__DIR__).'/.env.local'),
      'phpMailAvailable' => function_exists('mail'),
      'opensslLoaded'    => extension_loaded('openssl'),
      'socketsAllowed'   => function_exists('stream_socket_client'),
    ];
    // Can we even open a socket to the mail server on each port?
    foreach ([587, 465, 25] as $port) {
      $t0 = microtime(true);
      $fp = @stream_socket_client(($port===465?'ssl://':'').($c['host']?:'localhost').':'.$port, $e1, $e2, 8);
      $r['reach'][$port] = $fp ? 'open in '.round((microtime(true)-$t0)*1000).'ms' : "blocked ($e2)";
      if ($fp) fclose($fp);
    }
    // Why is a particular address being refused a code? (no code is revealed)
    $who = strtolower(trim($_GET['email'] ?? ''));
    if ($who !== '') {
      $row = otp_row($who);
      $r['address'] = $who;
      $r['addressState'] = $row ? [
        'codesSentToday' => (int) $row['sends'],
        'secondsSinceLastSend' => $row['last_sent'] ? intdiv(now_ms() - (int)$row['last_sent'], 1000) : null,
        'wrongAttempts' => (int) $row['attempts'],
        'codeExpired' => now_ms() > (int) $row['expires_at'],
        'currentlyVerified' => email_is_verified($who),
      ] : 'no code has ever been requested for this address';
      $r['codesFromThisIpLastHour'] = rate_count('otp:' . client_ip(), 3600000);
    }

    $to = trim($_GET['to'] ?? '');
    if ($to !== '' && filter_var($to, FILTER_VALIDATE_EMAIL)) {
      [$ok, $err] = send_mail($to, 'Fudgio test email', "If you are reading this, sending works.\n\n- Fudgio");
      $r['testSendTo'] = $to;
      $r['testSendOk'] = $ok;
      $r['testSendError'] = $ok ? '' : $err;
    } else {
      $r['hint'] = 'Add &to=your@email.com to actually send a test message.';
    }
    out($r);
  }

  // ---- email verification (checkout) ----
  if ($seg[0]==='verify') {
    $action = $seg[1] ?? '';
    if ($action==='send' && $method==='POST') {
      $email = strtolower(trim((string)(body()['email'] ?? '')));
      if (!filter_var($email, FILTER_VALIDATE_EMAIL)) err('Please enter a valid email address.');
      $r = otp_send($email, client_ip());
      isset($r['error']) ? err($r['error'], 429) : out(['ok'=>true,'sent'=>true]);
    }
    if ($action==='check' && $method==='POST') {
      $b = body();
      $email = strtolower(trim((string)($b['email'] ?? '')));
      $code  = preg_replace('/\D/', '', (string)($b['code'] ?? ''));
      if (!filter_var($email, FILTER_VALIDATE_EMAIL)) err('Please enter a valid email address.');
      if (strlen($code) !== 5) err('Please enter the 5-digit code from the email.');
      // Slow down code-guessing from a single machine.
      $ip = client_ip();
      if ($ip !== '' && rate_count('otpcheck:'.$ip, 900000) >= 30) err('Too many attempts. Please try again later.', 429);
      if ($ip !== '') rate_hit('otpcheck:'.$ip, $ip);
      $r = otp_check($email, $code);
      isset($r['error']) ? err($r['error']) : out(['ok'=>true,'verified'=>true]);
    }
    if ($action==='status' && $method==='GET') {
      $email = strtolower(trim((string)($_GET['email'] ?? '')));
      out(['verified' => $email !== '' && email_is_verified($email)]);
    }
    err('Not found',404);
  }

  // ---- products ----
  if ($seg[0]==='products') {
    if (count($seg)===1 && $method==='GET') { $admin=hash_equals(cfg()['adminToken'], (string)($_SERVER['HTTP_X_ADMIN_TOKEN']??'')); out(products_all($admin)); }
    if (count($seg)===1 && $method==='POST') { require_admin(); out(product_create(body()), 201); }
    $pid = $seg[1] ?? '';
    if (count($seg)===2 && $method==='GET') { $p=product_get($pid); $p?out($p):err('Not found',404); }
    if (count($seg)===2 && $method==='PATCH') { require_admin(); $p=product_update($pid, body()); $p?out($p):err('Not found',404); }
    if (count($seg)===2 && $method==='DELETE') { require_admin(); product_delete($pid)?out(['ok'=>true]):err('Not found',404); }
    if (($seg[2]??'')==='image') {
      require_admin();
      if ($method==='PUT'){
        $img=body(8000000)['imageUrl']??'';
        if(!is_string($img)||$img==='') err('No image.');
        if(strlen($img)>6000000) err('Image too large.');
        if(!preg_match('#^data:image/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=\s]+$#', $img)) err('Unsupported image format.');
        out(product_update($pid,['imageUrl'=>$img]));
      }
      if ($method==='DELETE'){ out(product_update($pid,['imageUrl'=>null])); }
    }
    err('Not found',404);
  }

  // ---- orders (customer create + admin) ----
  if ($seg[0]==='orders') {
    if (count($seg)===1 && $method==='POST') {
      // Flood guard only. Real customers retry after validation errors, and
      // whole neighbourhoods share one carrier IP, so keep this well above the
      // per-email and per-phone rules that do the actual work.
      throttle('orderpost', 60, 3600000);
      $b=body(); $u=current_user();
      $cust=$b['customer']??[]; if($u && empty($cust['email'])) $cust['email']=$u['email'];
      $r=order_create($b['items']??[], $cust, $u['id']??null);
      isset($r['error'])?err($r['error']):out(['order'=>$r['order']],201);
    }
    require_admin();
    if (count($seg)===1 && $method==='GET') out(orders_all());
    $oid=$seg[1]??'';
    if (count($seg)===2 && $method==='GET'){ $o=order_get($oid); $o?out($o):err('Not found',404); }
    if (count($seg)===2 && $method==='PATCH'){ $r=order_update_status($oid, body()['status']??''); isset($r['error'])?err($r['error']):out($r['order']); }
    if (count($seg)===2 && $method==='DELETE'){ out(['ok'=>order_delete($oid)]); }
    err('Not found',404);
  }

  // ---- track (public: order id + phone) ----
  if ($path==='track' && $method==='POST') {
    throttle('track', 30, 900000);   // stops order-number/phone guessing
    $b=body(); $o=order_get(trim($b['orderId']??''));
    if(!$o || preg_replace('/\D/','',$o['customer']['phone']??'') !== preg_replace('/\D/','',$b['phone']??'')) err('No order found with that number and phone.',404);
    out($o);
  }

  // ---- auth ----
  if ($seg[0]==='auth') {
    $action=$seg[1]??'';
    if ($action==='register' && $method==='POST') {
      throttle('register', 8, 3600000);
      $b=body(); $name=trim($b['name']??''); $email=strtolower(trim($b['email']??'')); $pass=$b['password']??'';
      if(!$name||!$email||!$pass) err('Name, email and password are required.');
      if(!filter_var($email,FILTER_VALIDATE_EMAIL)) err('Please enter a valid email.');
      if(strlen($pass)<6) err('Password must be at least 6 characters.');
      if(user_row_by_email($email)) err('An account with this email already exists.');
      $u=user_create(['name'=>$name,'email'=>$email,'phone'=>$b['phone']??null,'passwordHash'=>password_hash($pass,PASSWORD_BCRYPT)]);
      session_regenerate_id(true);
      $_SESSION['uid']=$u['id']; out(['user'=>public_user($u)],201);
    }
    if ($action==='login' && $method==='POST') {
      throttle('signin', 15, 900000);   // brute-force protection
      $b=body(); $row=user_row_by_email(strtolower(trim($b['email']??'')));
      if(!$row || !$row['password_hash'] || !password_verify($b['password']??'', $row['password_hash'])) err('Invalid email or password.');
      session_regenerate_id(true);
      $_SESSION['uid']=$row['id']; user_update($row['id'],['last_login_at'=>now_ms()]); out(['user'=>public_user(user_by_id($row['id']))]);
    }
    if ($action==='logout' && $method==='POST'){ $_SESSION=[]; session_destroy(); out(['ok'=>true]); }
    err('Not found',404);
  }

  // ---- me ----
  if ($path==='me') {
    if ($method==='GET') out(['user'=>public_user(current_user())]);
    if ($method==='PATCH'){ $u=current_user(); if(!$u) err('Not signed in.',401); $b=body();
      user_update($u['id'], array_filter(['name'=>$b['name']??null,'phone'=>$b['phone']??null,'city'=>$b['city']??null,'address'=>$b['address']??null], fn($v)=>$v!==null));
      out(['user'=>public_user(user_by_id($u['id']))]); }
  }
  if ($path==='my/orders'){ $u=current_user(); if(!$u) err('Not signed in.',401); out(orders_all($u['id'])); }

  // ---- admin: analytics / users ----
  if ($path==='analytics'){ require_admin(); out(analytics()); }
  if ($path==='users'){ require_admin(); out(users_all()); }
  if ($path==='settings'){ require_admin(); if($method==='GET') out(settings_get()); out(settings_set(body())); }
  if ($path==='export/orders'){ require_admin(); header('Content-Type: text/csv'); header('Content-Disposition: attachment; filename="fudgio-orders.csv"'); echo orders_csv(); exit; }
  if ($seg[0]==='users' && ($seg[2]??'')==='orders'){ require_admin(); out(orders_all($seg[1])); }
  if ($path==='login' && $method==='POST'){
    if(!ip_allowed()) err('Forbidden: this device is not allowed to access the admin.',403);
    throttle('adminlogin', 10, 900000);   // brute-force protection on the admin password
    $ok = hash_equals(cfg()['adminToken'], (string)(body()['token']??''));
    usleep(250000);                        // constant-ish delay slows guessing further
    out($ok?['ok'=>true]:['error'=>'Wrong password.'], $ok?200:401);
  }

  err('Not found: '.$path, 404);
} catch (Throwable $e) {
  // Never leak stack/DB details to the public; log them instead.
  error_log('Fudgio API error: ' . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine());
  $r = ['error'=>'Server error'];
  if (env('APP_DEBUG') === 'true') $r['detail'] = $e->getMessage();
  out($r, 500);
}
