// Order notifications. Sends an email (any SMTP) and/or POSTs to a webhook when
// a new order is placed, so the shop owner is alerted instantly. Fully optional:
// if nothing is configured it just logs to the console — it never blocks or
// breaks order placement.
import nodemailer from 'nodemailer';
import { config } from './config.js';

const money = (n) => `${config.brand.currency} ${Number(n).toLocaleString('en-US')}`;

let transporter = null;
function getTransporter() {
  if (transporter) return transporter;
  const s = config.notify.smtp;
  if (!s.enabled) return null;
  transporter = nodemailer.createTransport({
    host: s.host, port: s.port, secure: s.secure, auth: { user: s.user, pass: s.pass }
  });
  return transporter;
}

function orderText(order) {
  const lines = order.items.map((i) => `  • ${i.qty}× ${i.name}${i.size ? ` (${i.size})` : ''} — ${money(i.lineTotal)}`).join('\n');
  return `New Fudgio order: ${order.id}

Customer: ${order.customer.name}
Phone:    ${order.customer.phone}
City:     ${order.customer.city}
Address:  ${order.customer.address}
${order.customer.notes ? `Notes:    ${order.customer.notes}\n` : ''}
Items:
${lines}

Subtotal: ${money(order.subtotal)}
Delivery: ${order.deliveryFee === 0 ? 'FREE' : money(order.deliveryFee)}
TOTAL:    ${money(order.total)}  (Cash on Delivery)

Manage it in the admin: ${config.brand.adminDomain}`;
}

function orderHtml(order) {
  const rows = order.items.map((i) =>
    `<tr><td style="padding:6px 10px">${i.qty}× ${i.name}${i.size ? ` <span style="color:#888">(${i.size})</span>` : ''}</td><td style="padding:6px 10px;text-align:right">${money(i.lineTotal)}</td></tr>`).join('');
  return `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;border:1px solid #eee;border-radius:12px;overflow:hidden">
    <div style="background:linear-gradient(135deg,#d98e4a,#ff6f91);color:#26130b;padding:18px 22px">
      <h2 style="margin:0">🍫 New order — ${order.id}</h2>
      <div style="font-weight:700">${money(order.total)} · Cash on Delivery</div>
    </div>
    <div style="padding:22px">
      <p><b>${order.customer.name}</b> · ${order.customer.phone}<br>
      📍 ${order.customer.address}, ${order.customer.city}
      ${order.customer.notes ? `<br><i>Note: ${order.customer.notes}</i>` : ''}</p>
      <table style="width:100%;border-collapse:collapse;margin:14px 0">${rows}
        <tr><td style="padding:6px 10px;color:#888">Delivery</td><td style="padding:6px 10px;text-align:right">${order.deliveryFee === 0 ? 'FREE' : money(order.deliveryFee)}</td></tr>
        <tr><td style="padding:10px;border-top:2px solid #eee;font-weight:800">Total</td><td style="padding:10px;border-top:2px solid #eee;text-align:right;font-weight:800">${money(order.total)}</td></tr>
      </table>
      <a href="https://${config.brand.adminDomain}" style="display:inline-block;background:#26130b;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">Open admin dashboard</a>
    </div>
  </div>`;
}

function contactText(message) {
  return `New Fudgio contact message

Name:    ${message.name}
Email:   ${message.email}

Message:
${message.body}`;
}

function contactHtml(message) {
  return `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;border:1px solid #eee;border-radius:12px;overflow:hidden">
    <div style="background:linear-gradient(135deg,#d98e4a,#ff6f91);color:#26130b;padding:18px 22px">
      <h2 style="margin:0">✉️ New contact message</h2>
      <div style="font-weight:700">${message.name} · ${message.email}</div>
    </div>
    <div style="padding:22px;white-space:pre-wrap">${message.body}</div>
  </div>`;
}

// Fire-and-forget: called after an order is created. Never throws.
export async function orderPlaced(order) {
  const tasks = [];

  const t = getTransporter();
  if (t) {
    tasks.push(
      t.sendMail({
        from: `"Fudgio Orders" <${config.notify.from}>`,
        to: config.notify.to,
        subject: `🍫 New order ${order.id} — ${money(order.total)} (COD)`,
        text: orderText(order),
        html: orderHtml(order)
      }).then(() => console.log(`📧 Order email sent for ${order.id}`))
        .catch((e) => console.error('Order email failed:', e.message))
    );
  }

  if (config.notify.webhookUrl) {
    tasks.push(
      fetch(config.notify.webhookUrl, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event: 'order.placed', order, text: orderText(order) })
      }).then(() => console.log(`🔔 Order webhook sent for ${order.id}`))
        .catch((e) => console.error('Order webhook failed:', e.message))
    );
  }

  if (!tasks.length) {
    console.log(`🔔 New order ${order.id} (${money(order.total)}) — configure SMTP_* or ORDER_WEBHOOK_URL to get alerts.`);
  }
  await Promise.allSettled(tasks);
}

export async function contactReceived(message) {
  const t = getTransporter();
  if (!t) {
    console.log(`✉️ Contact message from ${message.email} — configure SMTP_* to receive it by email.`);
    return;
  }

  try {
    await t.sendMail({
      from: `"Fudgio Contact" <${config.notify.from}>`,
      to: config.notify.to,
      replyTo: message.email,
      subject: `✉️ Contact form: ${message.name}`,
      text: contactText(message),
      html: contactHtml(message)
    });
    console.log(`📧 Contact email sent for ${message.email}`);
  } catch (error) {
    console.error('Contact email failed:', error.message);
  }
}
