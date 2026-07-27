import { config } from './config.js';

let warnedAboutMissingVerification = false;

function verificationUnavailable() {
  return !config.recaptcha.projectId || !config.recaptcha.apiKey;
}

function warnIfVerificationUnavailable() {
  if (warnedAboutMissingVerification || !config.recaptcha.siteKey || !verificationUnavailable()) return;
  warnedAboutMissingVerification = true;
  console.warn('reCAPTCHA site key is configured but server verification is disabled. Set RECAPTCHA_PROJECT_ID and RECAPTCHA_API_KEY to enforce assessments.');
}

export function recaptchaClientConfig() {
  return {
    enabled: !!config.recaptcha.siteKey,
    siteKey: config.recaptcha.siteKey
  };
}

export async function verifyRecaptcha({ token, expectedAction, req, minScore = config.recaptcha.minimumScore }) {
  if (!config.recaptcha.siteKey) return { ok: true, skipped: true };
  if (!token) return { ok: false, status: 400, error: 'Verification expired. Please try again.' };

  if (verificationUnavailable()) {
    warnIfVerificationUnavailable();
    return { ok: true, skipped: true };
  }

  const url = `https://recaptchaenterprise.googleapis.com/v1/projects/${encodeURIComponent(config.recaptcha.projectId)}/assessments?key=${encodeURIComponent(config.recaptcha.apiKey)}`;
  const userAgent = req.get('user-agent') || '';

  let payload;
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event: {
          token,
          expectedAction,
          siteKey: config.recaptcha.siteKey,
          userAgent,
          userIpAddress: req.ip
        }
      })
    });
    payload = await response.json();
    if (!response.ok) {
      console.error('reCAPTCHA assessment request failed:', payload);
      return { ok: false, status: 502, error: 'Verification service is unavailable. Please try again.' };
    }
  } catch (error) {
    console.error('reCAPTCHA assessment error:', error.message);
    return { ok: false, status: 502, error: 'Verification service is unavailable. Please try again.' };
  }

  const tokenProps = payload.tokenProperties || {};
  if (!tokenProps.valid) {
    return { ok: false, status: 403, error: 'Verification failed. Please try again.', reason: tokenProps.invalidReason || 'invalid-token' };
  }
  if (tokenProps.action !== expectedAction) {
    return { ok: false, status: 403, error: 'Verification action mismatch. Please try again.', reason: 'action-mismatch' };
  }

  const score = payload.riskAnalysis?.score;
  if (typeof score === 'number' && score < minScore) {
    return { ok: false, status: 403, error: 'We could not verify this request. Please try again.', reason: 'low-score', score };
  }

  return { ok: true, score, reasons: payload.riskAnalysis?.reasons || [] };
}