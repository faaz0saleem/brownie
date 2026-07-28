/* Fudgio admin — reCAPTCHA client config.
   On PHP hosting there is no server endpoint generating this file, so this
   static version keeps the dashboard from requesting a URL that 404s.
   To turn reCAPTCHA on, set enabled:true and paste your site key below. */
window.FUDGIO_ADMIN = window.FUDGIO_ADMIN || { recaptcha: { enabled: false, siteKey: '' } };
