'use strict';

/**
 * Writes every email template (Thai + English) as HTML files to look at in a browser.
 *   node scripts/preview-emails.js [outDir]       (default: ./email-previews)
 * Logos load from FRONTEND_URL (default https://plannity.space).
 */
const fs = require('node:fs');
const path = require('node:path');
const t = require('../src/services/mail/templates');

const out = path.resolve(process.argv[2] || 'email-previews');
const siteUrl = process.env.FRONTEND_URL || 'https://plannity.space';
const expiresAt = new Date(Date.now() + 7 * 86400_000).toISOString();
fs.mkdirSync(out, { recursive: true });

for (const locale of ['th', 'en']) {
  const emails = {
    invitation: t.invitation({ locale, siteUrl, inviterName: 'Ploy', brandName: 'Lovekang Café', role: 'editor', link: `${siteUrl}/invite/3f9a2c1e7b`, expiresAt }),
    'confirm-email': t.confirmEmail({ locale, siteUrl, name: 'Kang', link: 'https://api.plannity.space/api/auth/email-confirmation?confirmation=8d1f0c2b9e' }),
    'reset-password': t.resetPassword({ locale, siteUrl, name: 'Kang', link: `${siteUrl}/reset-password?code=5b7e1d9c4a` }),
  };
  for (const [name, e] of Object.entries(emails)) {
    fs.writeFileSync(path.join(out, `${name}.${locale}.html`), e.html);
    fs.writeFileSync(path.join(out, `${name}.${locale}.txt`), `Subject: ${e.subject}\n\n${e.text}`);
  }
}
console.log(`Email previews written to ${out}`);
