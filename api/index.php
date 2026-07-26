<?php
// Fudgio API front-controller. All /api/* requests route here (see .htaccess).
declare(strict_types=1);
require_once __DIR__ . '/db.php';

ini_set('session.cookie_lifetime', (string)(60*60*24*30));
ini_set('session.gc_maxlifetime', (string)(60*60*24*30));
session_set_cookie_params(['lifetime'=>60*60*24*30,'path'=>'/','httponly'=>true,'samesite'=>'Lax']);
session_start();

header('Content-Type: application/json');
// CORS so the admin subdomain (admin.fudgio.com) can call this API.
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if (preg_match('#^https?://([a-z0-9-]+\.)?fudgio\.com$#i', $origin) || $origin==='') {
  if ($origin) header("Access-Control-Allow-Origin: $origin");
  header('Access-Control-Allow-Credentials: true');
}
header('Access-Control-Allow-Headers: Content-Type, x-admin-token');
header('Access-Control-Allow-Methods: GET, POST, PATCH, PUT, DELETE, OPTIONS');
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') { http_response_code(204); exit; }

function body(): array { $j = json_decode(file_get_contents('php://input'), true); return is_array($j) ? $j : []; }
function out($d, int $code=200){ http_response_code($code); echo json_encode($d); exit; }
function err(string $m, int $code=400){ out(['error'=>$m], $code); }
function require_admin(){ $t=$_SERVER['HTTP_X_ADMIN_TOKEN'] ?? ($_GET['token']??''); if($t!==cfg()['adminToken']) err('Unauthorized.',401); }
function current_user(): ?array { return isset($_SESSION['uid']) ? user_by_id($_SESSION['uid']) : null; }
function public_user(?array $u): ?array { return $u ? ['id'=>$u['id'],'name'=>$u['name'],'email'=>$u['email'],'phone'=>$u['phone'],'avatarUrl'=>$u['avatarUrl']??null,'city'=>$u['city'],'address'=>$u['address'],'orders'=>$u['orders'],'totalSpent'=>$u['totalSpent']] : null; }

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?? '/';
$path = preg_replace('#^.*/api/?#', '', $path);        // strip everything up to /api/
$path = trim($path, '/');
$seg = $path === '' ? [] : explode('/', $path);

try {
  // ---- health ----
  if ($path==='health' || $path==='healthz') out(['ok'=>true,'driver'=>db_driver(),'envFileFound'=>is_file(__DIR__.'/../.env'),'dbHostSet'=>(bool)env('DB_HOST'),'time'=>date('c')]);
  if ($path==='config') out(['statuses'=>['Pending','Confirmed','Baking','Out for Delivery','Delivered','Cancelled'],'currency'=>cfg()['currency']]);

  // ---- products ----
  if ($seg[0]==='products') {
    if (count($seg)===1 && $method==='GET') { $admin=(($_SERVER['HTTP_X_ADMIN_TOKEN']??'')===cfg()['adminToken']); out(products_all($admin)); }
    if (count($seg)===1 && $method==='POST') { require_admin(); out(product_create(body()), 201); }
    $pid = $seg[1] ?? '';
    if (count($seg)===2 && $method==='GET') { $p=product_get($pid); $p?out($p):err('Not found',404); }
    if (count($seg)===2 && $method==='PATCH') { require_admin(); $p=product_update($pid, body()); $p?out($p):err('Not found',404); }
    if (($seg[2]??'')==='image') {
      require_admin();
      if ($method==='PUT'){ $img=body()['imageUrl']??''; if(!$img) err('No image.'); if(strlen($img)>6000000) err('Image too large.'); out(product_update($pid,['imageUrl'=>$img])); }
      if ($method==='DELETE'){ out(product_update($pid,['imageUrl'=>null])); }
    }
    err('Not found',404);
  }

  // ---- orders (customer create + admin) ----
  if ($seg[0]==='orders') {
    if (count($seg)===1 && $method==='POST') {
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
    err('Not found',404);
  }

  // ---- track (public: order id + phone) ----
  if ($path==='track' && $method==='POST') {
    $b=body(); $o=order_get(trim($b['orderId']??''));
    if(!$o || preg_replace('/\D/','',$o['customer']['phone']??'') !== preg_replace('/\D/','',$b['phone']??'')) err('No order found with that number and phone.',404);
    out($o);
  }

  // ---- auth ----
  if ($seg[0]==='auth') {
    $action=$seg[1]??'';
    if ($action==='register' && $method==='POST') {
      $b=body(); $name=trim($b['name']??''); $email=strtolower(trim($b['email']??'')); $pass=$b['password']??'';
      if(!$name||!$email||!$pass) err('Name, email and password are required.');
      if(!filter_var($email,FILTER_VALIDATE_EMAIL)) err('Please enter a valid email.');
      if(strlen($pass)<6) err('Password must be at least 6 characters.');
      if(user_row_by_email($email)) err('An account with this email already exists.');
      $u=user_create(['name'=>$name,'email'=>$email,'phone'=>$b['phone']??null,'passwordHash'=>password_hash($pass,PASSWORD_BCRYPT)]);
      $_SESSION['uid']=$u['id']; out(['user'=>public_user($u)],201);
    }
    if ($action==='login' && $method==='POST') {
      $b=body(); $row=user_row_by_email(strtolower(trim($b['email']??'')));
      if(!$row || !$row['password_hash'] || !password_verify($b['password']??'', $row['password_hash'])) err('Invalid email or password.');
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
  if ($seg[0]==='users' && ($seg[2]??'')==='orders'){ require_admin(); out(orders_all($seg[1])); }
  if ($path==='login' && $method==='POST'){ $ok=(body()['token']??'')===cfg()['adminToken']; out($ok?['ok'=>true]:['error'=>'Wrong password.'], $ok?200:401); }

  err('Not found: '.$path, 404);
} catch (Throwable $e) {
  out(['error'=>'Server error','detail'=>$e->getMessage()], 500);
}
