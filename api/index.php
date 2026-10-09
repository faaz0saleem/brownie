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
      $r['schema'] = (int) meta_get(db(), 'schema');     // 3 = bandana catalogue in place
      $r['bandanas'] = (int) db()->query("SELECT COUNT(*) c FROM products WHERE active=1 AND color IS NOT NULL AND color<>''")->fetch()['c'];
    } catch (Throwable $e) { $r['dbError'] = $e->getMessage(); }
    if (db_driver()==='sqlite') {
      $p = $GLOBALS['__fudgio_sqlite'] ?? '';
      $r['sqlitePath'] = $p; $r['sqliteExists'] = $p && is_file($p);
      $r['sqliteSizeBytes'] = ($p && is_file($p)) ? filesize($p) : 0;
    }
    out($r);
  }
  if ($path==='config') out(['statuses'=>order_statuses(),'currency'=>cfg()['currency']]);

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
      // Tells the checkout whether to show the SMS verification step. It only
      // ever applies to Pakistani numbers: SMS guards cash on delivery, and an
      // international order is paid before it ships.
      'smsVerification'  => sms_ready(),
      // International shipping, all in USD.
      'intlEnabled'      => (bool)($s['intlEnabled'] ?? true),
      'intlShipping'     => (int)($s['intlShipping'] ?? 12),
      'intlFreeOver'     => (int)($s['intlFreeOver'] ?? 0),
      'usdRate'          => max(1, (int)($s['usdRate'] ?? 280)),
      'intlPaymentLink'  => (string)($s['intlPaymentLink'] ?? ''),
      // The buy-3 deal, delivery times and social links shown across the site.
      'bundleQty'        => (int)($s['bundleQty'] ?? 3),
      'bundlePct'        => (int)($s['bundlePct'] ?? 15),
      'daysPk'           => (string)($s['daysPk'] ?? ''),
      'daysIntl'         => (string)($s['daysIntl'] ?? ''),
      'instagram'        => (string)($s['instagram'] ?? ''),
      'whatsapp'         => (string)($s['whatsapp'] ?? ''),
      // A real photo for the top of the home page, if the shop has one.
      'bannerUrl'        => media_urls()['banner'] ?? '',
      // Photos for the hero and the three "Made to be worn" looks.
      'media'            => (object) media_urls(),
    ]);
  }

  // ---- reviews ----
  // GET /api/reviews[?slug=] is public (approved only). POST needs the order
  // number and phone. The admin lists, approves, hides and deletes.
  if ($seg[0]==='reviews') {
    if (count($seg)===1 && $method==='GET') {
      if (isset($_GET['all'])) { require_admin(); out(reviews_all()); }
      out(reviews_public(clean_text($_GET['slug'] ?? '', 120)));
    }
    if (count($seg)===1 && $method==='POST') {
      throttle('review', 12, 3600000);
      $r = review_create(body(8192));
      isset($r['error']) ? err($r['error']) : out(['ok'=>true], 201);
    }
    if (count($seg)===2) {
      require_admin();
      if ($method==='PATCH') out(['ok'=>review_set_status($seg[1], (string)(body()['status'] ?? ''))]);
      if ($method==='DELETE') out(['ok'=>review_delete($seg[1])]);
    }
    err('Not found', 404);
  }

  // Public: "get new colours first".
  if ($path==='subscribe' && $method==='POST') {
    throttle('subscribe', 20, 3600000);
    $b = body(4096);
    if (!empty($b['website'])) out(['ok'=>true]);       // honeypot: a bot filled the hidden field
    $r = subscriber_add((string)($b['email'] ?? ''), (string)($b['source'] ?? 'site'));
    isset($r['error']) ? err($r['error']) : out(['ok'=>true]);
  }

  // Public: the contact form. Stored for the admin inbox, then emailed to
  // the shop after the response so the sender is not kept waiting on SMTP.
  if ($path==='contact' && $method==='POST') {
    throttle('contact', 6, 3600000);
    $b = body(16384);
    if (!empty($b['website'])) out(['ok'=>true]);       // honeypot
    $r = message_create($b);
    if (isset($r['error'])) err($r['error']);
    $payload = json_encode(['ok'=>true]);
    http_response_code(201);
    ignore_user_abort(true);
    header('Content-Length: ' . strlen($payload));
    header('Connection: close');
    echo $payload;
    if (function_exists('fastcgi_finish_request'))      fastcgi_finish_request();
    elseif (function_exists('litespeed_finish_request')) litespeed_finish_request();
    else { while (ob_get_level() > 0) @ob_end_flush(); @flush(); }
    notify_message($r['message']);
    exit;
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

  // ---- site photos: /api/media/<banner|look1|look2|look3> ----
  // (/api/banner is the same as /api/media/banner, kept for older pages.)
  if ($path==='banner' || ($seg[0]==='media' && count($seg)===2)) {
    $slot = $path==='banner' ? 'banner' : $seg[1];
    if (!in_array($slot, media_slots(), true)) err('Not found', 404);
    if ($method==='GET') {
      $img = media_bytes($slot);
      if (!$img) { http_response_code(404); header('Content-Type: text/plain'); echo 'Not found'; exit; }
      header('Content-Type: ' . $img['type']);
      header('Cache-Control: public, max-age=31536000, immutable');
      header('Content-Length: ' . strlen($img['bytes']));
      echo $img['bytes']; exit;
    }
    require_admin();
    if ($method==='PUT') {
      $img = body(8000000)['imageUrl'] ?? '';
      if (!is_string($img) || !preg_match('#^data:image/(png|jpe?g|webp);base64,[A-Za-z0-9+/=\s]+$#', $img)) err('Please upload a JPG, PNG or WebP photo.');
      if (strlen($img) > 6000000) err('Image too large.');
      media_set($slot, $img); out(['ok'=>true, 'url'=>media_urls()[$slot] ?? '']);
    }
    if ($method==='DELETE') { media_set($slot, null); out(['ok'=>true]); }
  }

  // ---- product photos, as real image files ----
  // /api/img/<product id>/<n>?v=<hash>. The hash in the URL changes with the
  // photo, so this can be cached for a year. Hidden products' photos are
  // still served: past orders and the admin show them.
  if ($seg[0]==='img' && count($seg)===3 && $method==='GET') {
    $img = product_photo_bytes(rawurldecode($seg[1]), (int)$seg[2]);
    if (!$img) { http_response_code(404); header('Content-Type: text/plain'); echo 'Not found'; exit; }
    header('Content-Type: ' . $img['type']);
    header('Cache-Control: public, max-age=31536000, immutable');
    header('Content-Length: ' . strlen($img['bytes']));
    echo $img['bytes']; exit;
  }

  // ---- products ----
  if ($seg[0]==='products') {
    if (count($seg)===1 && $method==='GET') { $admin=hash_equals(cfg()['adminToken'], (string)($_SERVER['HTTP_X_ADMIN_TOKEN']??'')); out(products_all($admin)); }
    if (count($seg)===1 && $method==='POST') { require_admin(); out(product_create(body()), 201); }
    $pid = $seg[1] ?? '';
    if (count($seg)===2 && $method==='GET') { $p=product_get($pid); $p?out($p):err('Not found',404); }
    if (count($seg)===2 && $method==='PATCH') { require_admin(); $p=product_update($pid, body()); $p?out($p):err('Not found',404); }
    if (count($seg)===2 && $method==='DELETE') { require_admin(); product_delete($pid)?out(['ok'=>true]):err('Not found',404); }
    // Photos. PUT …/image makes an upload the main photo; POST …/photos adds
    // one; DELETE …/photos/<n> removes one; POST …/photos/<n>/main promotes
    // it; DELETE …/image removes them all.
    $readImage = function () {
      $img = body(8000000)['imageUrl'] ?? '';
      if (!is_string($img) || $img === '') err('No image.');
      if (strlen($img) > 6000000) err('Image too large.');
      if (!preg_match('#^data:image/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=\s]+$#', $img)) err('Unsupported image format.');
      return $img;
    };
    if (($seg[2]??'')==='image') {
      require_admin();
      if ($method==='PUT'){
        $r = product_photo_edit($pid, 'add', null, $readImage());
        if (is_string($r)) err($r);
        $r = product_photo_edit($pid, 'main', count($r['photos']) - 1);
        is_string($r) ? err($r) : out($r);
      }
      if ($method==='DELETE'){ $r = product_photos_set($pid, []); $r ? out($r) : err('Not found', 404); }
    }
    if (($seg[2]??'')==='photos') {
      require_admin();
      $n = isset($seg[3]) ? (int)$seg[3] : null;
      if ($method==='POST' && $n === null) $r = product_photo_edit($pid, 'add', null, $readImage());
      elseif ($method==='POST' && ($seg[4]??'')==='main') $r = product_photo_edit($pid, 'main', $n);
      elseif ($method==='DELETE' && $n !== null) $r = product_photo_edit($pid, 'remove', $n);
      else err('Not found', 404);
      is_string($r) ? err($r) : out($r);
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
      // SMS only applies inside Pakistan. It exists because cash on delivery
      // lets someone order without paying; an international order is paid
      // before it ships, so the CAPTCHA alone is enough there.
      $domestic = is_domestic((string)($cust['country'] ?? 'PK') ?: 'PK');
      if ($domestic && sms_ready()) {
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
      if ($domestic && sms_ready()) phone_otp_consume((string)($cust['phone'] ?? ''));

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
  if ($path==='subscribers'){ require_admin(); out(subscribers_all()); }
  if ($seg[0]==='subscribers' && count($seg)===2 && $method==='DELETE'){ require_admin(); out(['ok'=>subscriber_delete(urldecode($seg[1]))]); }
  if ($path==='export/subscribers'){ require_admin(); header('Content-Type: text/csv'); header('Content-Disposition: attachment; filename="fudgio-subscribers.csv"'); echo subscribers_csv(); exit; }
  if ($path==='messages'){ require_admin(); out(messages_all()); }
  if ($seg[0]==='messages' && count($seg)===2){
    require_admin();
    if ($method==='PATCH') out(['ok'=>message_set_status($seg[1], (string)(body()['status'] ?? ''))]);
    if ($method==='DELETE') out(['ok'=>message_delete($seg[1])]);
  }
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
