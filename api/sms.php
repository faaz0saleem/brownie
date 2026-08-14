<?php
// Sending SMS.
//
// Deliberately provider-agnostic. Most Pakistani bulk-SMS gateways (Veevotech,
// BraveSMS, Telenor/Jazz business panels, Rombit, and so on) expose the same
// shape of API: one HTTP call with the number and the text in the query string
// or the form body. Rather than hardcode one of them, `generic` builds the
// request from a URL template in .env.local, so switching provider is a config
// change and not a code change. Twilio is handled separately because its API
// needs basic auth and a fixed field naming.
//
// Nothing here throws. Every path returns [ok, error] so a failure to send a
// code can be reported to the customer and logged, never fatal.
declare(strict_types=1);

function sms_config(): array {
  return [
    // generic | twilio | log | '' (disabled)
    'provider' => strtolower((string) env('SMS_PROVIDER', '')),
    'from'     => (string) env('SMS_FROM', env('BRAND_NAME', 'Fudgio')),

    // --- generic HTTP gateway ---
    // Placeholders {to} {text} {from} are URL-encoded and substituted.
    // e.g. https://api.veevotech.com/v3/sendsms?apikey=KEY&sender={from}&receivernum={to}&textmessage={text}
    'url'      => (string) env('SMS_URL', ''),
    'method'   => strtoupper((string) env('SMS_METHOD', 'GET')),
    // Optional POST body template, same placeholders. Ignored for GET.
    'body'     => (string) env('SMS_BODY', ''),
    // Optional extra header, e.g. "Authorization: Bearer xyz"
    'header'   => (string) env('SMS_HEADER', ''),
    // A substring the provider returns on success. Leave blank to accept any
    // HTTP 2xx — set it when your gateway answers 200 even for failures.
    'okText'   => (string) env('SMS_SUCCESS_CONTAINS', ''),

    // --- twilio ---
    'sid'      => (string) env('TWILIO_ACCOUNT_SID', ''),
    'token'    => (string) env('TWILIO_AUTH_TOKEN', ''),
  ];
}

/** True when the shop is able to send an SMS at all. */
function sms_ready(): bool {
  $c = sms_config();
  if ($c['provider'] === 'log')     return true;                       // testing
  if ($c['provider'] === 'generic') return $c['url'] !== '';
  if ($c['provider'] === 'twilio')  return $c['sid'] !== '' && $c['token'] !== '' && $c['from'] !== '';
  return false;
}

/**
 * Normalises a Pakistani mobile number to E.164 (+923xxxxxxxxx).
 *
 * Customers type 0300-1234567, 0300 1234567, 3001234567 and +92 300 1234567
 * interchangeably, and a gateway will silently drop anything it does not
 * recognise, so this is done once here rather than trusted from the form.
 * Returns '' when the number cannot be understood.
 */
function sms_normalise(string $phone): string {
  $d = preg_replace('/\D/', '', $phone);
  if ($d === '') return '';
  if (str_starts_with($d, '0092')) $d = substr($d, 4);
  elseif (str_starts_with($d, '92')) $d = substr($d, 2);
  elseif (str_starts_with($d, '0')) $d = substr($d, 1);
  // A Pakistani mobile is 3xxxxxxxxx once the country/trunk prefix is gone.
  if (strlen($d) !== 10 || $d[0] !== '3') return '';
  return '+92' . $d;
}

/** Substitutes {to} {text} {from} into a template, URL-encoding each value. */
function sms_fill(string $tpl, array $vars): string {
  foreach ($vars as $k => $v) $tpl = str_replace('{' . $k . '}', rawurlencode($v), $tpl);
  return $tpl;
}

/**
 * Sends one message. Returns [bool ok, string error].
 */
function sms_send(string $to, string $text): array {
  $c = sms_config();
  $e164 = sms_normalise($to);
  if ($e164 === '') return [false, 'That does not look like a Pakistani mobile number.'];
  if (!sms_ready())  return [false, 'SMS sending is not configured.'];

  if ($c['provider'] === 'log') {
    // Testing mode: write the message to the PHP error log instead of sending.
    error_log('Fudgio SMS (log mode) to ' . $e164 . ': ' . $text);
    return [true, ''];
  }

  if ($c['provider'] === 'twilio') {
    $url = 'https://api.twilio.com/2010-04-01/Accounts/' . rawurlencode($c['sid']) . '/Messages.json';
    return sms_http($url, 'POST',
      http_build_query(['To' => $e164, 'From' => $c['from'], 'Body' => $text]),
      ['Content-Type: application/x-www-form-urlencoded'],
      $c['sid'] . ':' . $c['token'], $c['okText']);
  }

  // generic
  $vars = ['to' => $e164, 'text' => $text, 'from' => $c['from']];
  $url  = sms_fill($c['url'], $vars);
  $body = $c['body'] !== '' ? sms_fill($c['body'], $vars) : '';
  $headers = [];
  if ($c['header'] !== '') $headers[] = $c['header'];
  if ($c['method'] === 'POST' && $body !== '' && !preg_grep('/^content-type:/i', $headers)) {
    $headers[] = 'Content-Type: application/x-www-form-urlencoded';
  }
  return sms_http($url, $c['method'], $body, $headers, '', $c['okText']);
}

/**
 * One HTTP request, via cURL when available and streams otherwise, so this
 * works on shared hosting with either configuration.
 */
function sms_http(string $url, string $method, string $body, array $headers, string $basicAuth, string $okText): array {
  $status = 0; $resp = ''; $err = '';

  if (function_exists('curl_init')) {
    $ch = curl_init($url);
    curl_setopt_array($ch, [
      CURLOPT_RETURNTRANSFER => true,
      CURLOPT_TIMEOUT        => 15,
      CURLOPT_CUSTOMREQUEST  => $method,
      CURLOPT_HTTPHEADER     => $headers,
    ]);
    if ($method === 'POST' && $body !== '') curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
    if ($basicAuth !== '') curl_setopt($ch, CURLOPT_USERPWD, $basicAuth);
    $resp   = (string) curl_exec($ch);
    $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $err    = curl_error($ch);
    curl_close($ch);
  } else {
    if ($basicAuth !== '') $headers[] = 'Authorization: Basic ' . base64_encode($basicAuth);
    $ctx = stream_context_create(['http' => [
      'method'        => $method,
      'header'        => implode("\r\n", $headers),
      'content'       => $method === 'POST' ? $body : '',
      'timeout'       => 15,
      'ignore_errors' => true,
    ]]);
    $resp = (string) @file_get_contents($url, false, $ctx);
    foreach ($http_response_header ?? [] as $h) {
      if (preg_match('#^HTTP/\S+\s+(\d{3})#', $h, $m)) $status = (int) $m[1];
    }
    if ($status === 0) $err = 'could not reach the SMS gateway';
  }

  if ($err !== '')                 return [false, 'SMS gateway error: ' . $err];
  if ($status < 200 || $status >= 300)
    return [false, 'SMS gateway returned HTTP ' . $status . ' ' . substr(trim($resp), 0, 200)];
  // Some gateways answer 200 with a failure message in the body.
  if ($okText !== '' && stripos($resp, $okText) === false)
    return [false, 'SMS gateway did not confirm delivery: ' . substr(trim($resp), 0, 200)];

  return [true, ''];
}
