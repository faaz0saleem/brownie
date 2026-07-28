<?php
// Minimal authenticated SMTP client (no external libraries).
// Sends mail as the configured mailbox (e.g. faaz.saleem@fudgio.com) so that
// verification codes and order alerts come from the real business address.
declare(strict_types=1);

function smtp_config(): array {
  return [
    'host'   => env('SMTP_HOST', ''),
    'port'   => (int) env('SMTP_PORT', '587'),
    'user'   => env('SMTP_USER', env('CONTACT_EMAIL', '')),
    'pass'   => env('SMTP_PASS', ''),
    'from'   => env('SMTP_FROM', env('CONTACT_EMAIL', '')),
    'name'   => env('BRAND_NAME', 'Fudgio'),
    'secure' => env('SMTP_SECURE', 'tls'),   // 'ssl' (465) | 'tls' (587) | ''
  ];
}
function smtp_ready(): bool {
  $c = smtp_config();
  return $c['host'] !== '' && $c['user'] !== '' && $c['pass'] !== '';
}

function smtp_line($fp, string $expect = ''): string {
  $data = '';
  while (($line = fgets($fp, 515)) !== false) {
    $data .= $line;
    if (!isset($line[3]) || $line[3] === ' ') break;   // last line of the reply
  }
  if ($expect !== '' && strncmp($data, $expect, strlen($expect)) !== 0) {
    throw new RuntimeException('SMTP: expected ' . $expect . ', got ' . trim($data));
  }
  return $data;
}
function smtp_cmd($fp, string $cmd, string $expect = ''): string {
  fwrite($fp, $cmd . "\r\n");
  return smtp_line($fp, $expect);
}

/**
 * Send an email. Returns [ok(bool), error(string)].
 * Uses authenticated SMTP when configured, otherwise falls back to PHP mail().
 */
function send_mail(string $to, string $subject, string $text, string $html = ''): array {
  $c = smtp_config();

  if (!smtp_ready()) {
    // Fallback: unauthenticated PHP mail (works on some hosts, often lands in spam)
    $headers = "From: {$c['name']} <{$c['from']}>\r\n"
             . "Reply-To: {$c['from']}\r\n"
             . "MIME-Version: 1.0\r\n"
             . "Content-Type: text/plain; charset=UTF-8";
    $ok = @mail($to, $subject, $text, $headers);
    return [$ok, $ok ? '' : 'SMTP is not configured and PHP mail() failed.'];
  }

  $secure = strtolower($c['secure']);
  $host   = ($secure === 'ssl' || $c['port'] === 465) ? 'ssl://' . $c['host'] : $c['host'];

  $ctx = stream_context_create(['ssl' => ['verify_peer' => true, 'verify_peer_name' => true]]);
  $fp = @stream_socket_client($host . ':' . $c['port'], $errno, $errstr, 20, STREAM_CLIENT_CONNECT, $ctx);
  if (!$fp) return [false, "Could not connect to mail server ({$errstr})"];
  stream_set_timeout($fp, 20);

  try {
    smtp_line($fp, '220');
    $ehlo = 'fudgio.com';
    smtp_cmd($fp, "EHLO $ehlo", '250');

    if ($secure === 'tls' && $c['port'] !== 465) {
      smtp_cmd($fp, 'STARTTLS', '220');
      $crypto = STREAM_CRYPTO_METHOD_TLS_CLIENT;
      if (defined('STREAM_CRYPTO_METHOD_TLSv1_2_CLIENT')) $crypto |= STREAM_CRYPTO_METHOD_TLSv1_2_CLIENT;
      if (!stream_socket_enable_crypto($fp, true, $crypto)) throw new RuntimeException('SMTP: TLS negotiation failed');
      smtp_cmd($fp, "EHLO $ehlo", '250');
    }

    smtp_cmd($fp, 'AUTH LOGIN', '334');
    smtp_cmd($fp, base64_encode($c['user']), '334');
    smtp_cmd($fp, base64_encode($c['pass']), '235');

    smtp_cmd($fp, 'MAIL FROM:<' . $c['from'] . '>', '250');
    smtp_cmd($fp, 'RCPT TO:<' . $to . '>', '250');
    smtp_cmd($fp, 'DATA', '354');

    $boundary = 'fud' . bin2hex(random_bytes(8));
    $headers  = 'From: ' . mb_encode_mimeheader($c['name']) . ' <' . $c['from'] . ">\r\n";
    $headers .= 'To: <' . $to . ">\r\n";
    $headers .= 'Subject: ' . mb_encode_mimeheader($subject) . "\r\n";
    $headers .= 'Date: ' . date('r') . "\r\n";
    $headers .= 'Message-ID: <' . bin2hex(random_bytes(10)) . '@fudgio.com>' . "\r\n";
    $headers .= "MIME-Version: 1.0\r\n";

    if ($html !== '') {
      $headers .= "Content-Type: multipart/alternative; boundary=\"$boundary\"\r\n";
      $body  = "--$boundary\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n" . $text . "\r\n";
      $body .= "--$boundary\r\nContent-Type: text/html; charset=UTF-8\r\n\r\n" . $html . "\r\n";
      $body .= "--$boundary--\r\n";
    } else {
      $headers .= "Content-Type: text/plain; charset=UTF-8\r\n";
      $body = $text . "\r\n";
    }

    // Dot-stuffing so a line starting with "." can't terminate the message early.
    $payload = preg_replace('/^\./m', '..', $headers . "\r\n" . $body);
    fwrite($fp, $payload . "\r\n.\r\n");
    smtp_line($fp, '250');
    smtp_cmd($fp, 'QUIT');
    fclose($fp);
    return [true, ''];
  } catch (Throwable $e) {
    @fclose($fp);
    return [false, $e->getMessage()];
  }
}
