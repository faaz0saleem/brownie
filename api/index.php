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
      // Tells the checkout whether to show the SMS verification step.
      'smsVerification'  => sms_ready(),
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

  // ---- CAPTCHA (checkout) ----
  // Issues a one-shot image challenge. The answer never leaves the server —
  // only a hash of it is stored — so there is nothing here to read back.
  if ($path==='captcha' && $method==='GET') {
    $r = captcha_create(client_ip());
    if (isset($r['error'])) err($r['error'], 429);
    if ($r['image'] === '') err('Verification is unavailable right now. Please try again later.', 503);
    out(['id'=>$r['id'], 'image'=>$r['image']]);
  }

  // ---- SMS diagnostics (admin only) ----
  // /api/diag/sms?token=<admin password>&to=03001234567
  // Reports the gateway settings and the real error from a send attempt, so a
  // misconfigured provider can be fixed rather than guessed at. Never echoes
  // the API key or auth token.
  if ($seg[0]==='diag' && ($seg[1]??'')==='sms') {
    require_admin();
    $c = sms_config();
    $r = [
      'provider'      => $c['provider'] ?: '(not set — phone verification is off)',
      'smsReady'      => sms_ready(),
      'from'          => $c['from'] ?: '(not set)',
      'urlTemplateSet'=> $c['url'] !== '',
      'method'        => $c['method'],
      'twilioSidSet'  => $c['sid'] !== '',
      'twilioTokenSet'=> $c['token'] !== '',
      'successNeedle' => $c['okText'] ?: '(any HTTP 2xx counts as sent)',
      'envLocalFound' => is_file(dirname(__DIR__).'/.env.local'),
      'curlAvailable' => function_exists('curl_init'),
    ];
    $to = trim($_GET['to'] ?? '');
    if ($to !== '') {
      $e164 = sms_normalise($to);
      $r['normalised'] = $e164 ?: '(not a valid Pakistani mobile number)';
      if ($e164 !== '') {
        [$ok, $err] = sms_send($e164, 'Fudgio test message. If you are reading this, SMS sending works.');
        $r['testSendOk'] = $ok;
        $r['testSendError'] = $ok ? '' : $err;
      }
    } else {
      $r['hint'] = 'Add &to=03001234567 to actually send a test message.';
    }
    out($r);
  }

  // ---- phone verification (checkout) ----
  if ($seg[0]==='verify' && ($seg[1]??'')==='phone') {
    $action = $seg[2] ?? '';
    if ($action==='send' && $method==='POST') {
      $b = body();
      // Sending an SMS costs money, so this endpoint is the one worth abusing.
      // The CAPTCHA is spent here rather than at order time.
      $cap = captcha_check((string)($b['captchaId'] ?? ''), (string)($b['captchaAnswer'] ?? ''));
      if (isset($cap['error'])) err($cap['error']);
      throttle('smssend', 25, 3600000);
      $r = phone_otp_send((string)($b['phone'] ?? ''), client_ip());
      isset($r['error']) ? err($r['error']) : out(['ok'=>true,'sent'=>true]);
    }
    if ($action==='check' && $method==='POST') {
      $b = body();
      $ip = client_ip();
      if ($ip !== '' && rate_count('smscheck:'.$ip, 900000) >= 30) err('Too many attempts. Please try again later.', 429);
      if ($ip !== '') rate_hit('smscheck:'.$ip, $ip);
      $r = phone_otp_check((string)($b['phone'] ?? ''), (string)($b['code'] ?? ''));
      isset($r['error']) ? err($r['error']) : out(['ok'=>true,'verified'=>true]);
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
      // Two ways to prove a real person is ordering, depending on what the shop
      // is configured for. With an SMS gateway the phone number is confirmed by
      // code, which is the stronger check and also gives a reachable number for
      // a COD delivery. Without one, fall back to the image CAPTCHA so the shop
      // still takes orders rather than refusing everyone.
      if (sms_ready()) {
        if (!phone_is_verified((string)($cust['phone'] ?? '')))
          err('Please verify your phone number before placing the order.');
      } else {
        $cap = captcha_check((string)($b['captchaId'] ?? ''), (string)($b['captchaAnswer'] ?? ''));
        if (isset($cap['error'])) err($cap['error']);
      }
      $r=order_create($b['items']??[], $cust, $u['id']??null);
      if (isset($r['error'])) err($r['error']);
      // Single-use: the same confirmed number cannot be replayed for a second
      // order without asking for a new code.
      if (sms_ready()) phone_otp_consume((string)($cust['phone'] ?? ''));

      // Answer the customer first, then send the owner's alert email, so the
      // shopper is never left watching a spinner while we talk to an SMTP
      // server. Content-Length plus Connection: close lets the browser treat
      // the response as finished even where the request cannot be formally
      // detached, and ignore_user_abort keeps the email going once it has.
      $payload = json_encode(['order'=>$r['order']]);
      http_response_code(201);
      ignore_user_abort(true);
      header('Content-Length: ' . strlen($payload));
      header('Connection: close');
      echo $payload;

      if (function_exists('fastcgi_finish_request'))      fastcgi_finish_request();   // php-fpm
      elseif (function_exists('litespeed_finish_request')) litespeed_finish_request(); // LiteSpeed
      else { while (ob_get_level() > 0) @ob_end_flush(); @flush(); }

      notify_order($r['order']);
      exit;
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
