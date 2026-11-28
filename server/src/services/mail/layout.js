'use strict';

/**
 * The one email layout, built from the app's design tokens (app/assets/css/main.css):
 * canvas #FBFAFF, white card with the #EBE7F7 line and 24px corners, Fredoka
 * headings, Plus Jakarta Sans / Noto Sans Thai body, the #6C4CF5 primary button,
 * and the logo's pink · sun · sky · lime as an accent strip.
 *
 * Email-safe: tables + inline styles (Gmail, Outlook), a bulletproof button,
 * hidden preheader, and a dark version for clients that honour
 * prefers-color-scheme (Apple Mail, iOS, Outlook.com).
 */

const C = {
  brand: '#6C4CF5', brandDark: '#5835E0', brandSoft: '#F3F0FF',
  ink: '#211C3A', muted: '#6B6588', line: '#EBE7F7', canvas: '#FBFAFF', surface: '#FFFFFF', surface2: '#F6F4FE',
  pink: '#FF6FAE', sun: '#FFB23F', sky: '#62C5F4', lime: '#A7E66B',
};
const SANS = "'Plus Jakarta Sans','Noto Sans Thai',-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const DISPLAY = "'Fredoka','Noto Sans Thai',ui-rounded,'SF Pro Rounded',-apple-system,'Segoe UI',Helvetica,Arial,sans-serif";

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const DARK_CSS = `
  @media (prefers-color-scheme: dark) {
    .pl-bg { background:#0F0C1E !important; }
    .pl-card { background:#17132B !important; border-color:#2C2650 !important; }
    .pl-box { background:#1E1938 !important; }
    .pl-fg { color:#F1EEFF !important; }
    .pl-muted { color:#A59FC4 !important; }
    .pl-chip { background:#2A2152 !important; color:#B6A3FC !important; }
    .pl-link { color:#B6A3FC !important; }
    .pl-line { background:#2C2650 !important; }
    .pl-logo-light { display:none !important; }
    .pl-logo-dark { display:block !important; max-height:none !important; overflow:visible !important; }
  }
  [data-ogsc] .pl-logo-light { display:none !important; }
  [data-ogsc] .pl-logo-dark { display:block !important; max-height:none !important; overflow:visible !important; }`;

/**
 * @param {object} o
 * @param {'th'|'en'} o.locale
 * @param {string} o.siteUrl       public site (logo + footer link), no trailing slash
 * @param {string} o.preheader     inbox preview text
 * @param {string} o.eyebrow
 * @param {string} o.title
 * @param {string} o.introHtml     already-escaped HTML (use esc() for values)
 * @param {{ label: string, url: string }} o.button
 * @param {{ label: string, value: string }[]} [o.details]
 * @param {string} [o.note]        small print under the button
 * @param {string} o.fallbackLabel "Button not working? Paste this link…"
 * @param {string} o.footer        why they got this email
 */
function layout(o) {
  const lang = o.locale === 'en' ? 'en' : 'th';
  const site = String(o.siteUrl || '').replace(/\/$/, '');
  const host = site.replace(/^https?:\/\//, '');
  const tagline = 'Less planning. More creating.'; // the brand tagline stays English in both languages, as in the app

  const details = (o.details || []).length
    ? `<tr><td style="padding:0 0 24px 0;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="pl-box" style="background:${C.surface2};border-radius:16px;">
          ${o.details.map((d, i) => `<tr>
            <td class="pl-muted" style="padding:${i ? '0' : '14px'} 18px ${i === o.details.length - 1 ? '14px' : '8px'} 18px;font-family:${SANS};font-size:13px;line-height:20px;color:${C.muted};width:38%;vertical-align:top;">${esc(d.label)}</td>
            <td class="pl-fg" style="padding:${i ? '0' : '14px'} 18px ${i === o.details.length - 1 ? '14px' : '8px'} 0;font-family:${SANS};font-size:14px;line-height:20px;font-weight:600;color:${C.ink};vertical-align:top;">${esc(d.value)}</td>
          </tr>`).join('')}
        </table>
      </td></tr>`
    : '';

  return `<!DOCTYPE html>
<html lang="${lang}" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<meta name="x-apple-disable-message-reformatting">
<title>${esc(o.title)}</title>
<link href="https://fonts.googleapis.com/css2?family=Fredoka:wght@600;700&family=Noto+Sans+Thai:wght@400;600;700&family=Plus+Jakarta+Sans:wght@400;600;700&display=swap" rel="stylesheet">
<style>
  body { margin:0; padding:0; width:100% !important; -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; }
  table { border-collapse:collapse; mso-table-lspace:0; mso-table-rspace:0; }
  img { border:0; outline:none; text-decoration:none; -ms-interpolation-mode:bicubic; }
  a { text-decoration:none; }
  .pl-btn:hover { background:${C.brandDark} !important; }
  @media (max-width:600px) {
    .pl-pad { padding:28px 22px !important; }
    .pl-title { font-size:24px !important; line-height:30px !important; }
    .pl-btn-cell, .pl-btn-cell tr, .pl-btn-cell td, .pl-btn { display:block !important; width:100% !important; text-align:center !important; box-sizing:border-box; }
  }${DARK_CSS}
</style>
</head>
<body class="pl-bg" style="margin:0;padding:0;background:${C.canvas};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">${esc(o.preheader)}&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="pl-bg" style="background:${C.canvas};">
  <tr><td align="center" style="padding:36px 12px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">

      <!-- Logo -->
      <tr><td align="center" style="padding:0 0 22px 0;">
        <a href="${esc(site)}" target="_blank">
          <img class="pl-logo-light" src="${esc(site)}/brand/logo-lockup.png" width="150" alt="Plannity" style="display:block;width:150px;height:auto;">
          <!--[if !mso]><!--><img class="pl-logo-dark" src="${esc(site)}/brand/logo-lockup-dark.png" width="150" alt="Plannity" style="display:none;max-height:0;overflow:hidden;width:150px;height:auto;"><!--<![endif]-->
        </a>
      </td></tr>

      <!-- Card -->
      <tr><td>
       <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="pl-card" style="border-collapse:separate;background:${C.surface};border:1px solid ${C.line};border-radius:24px;overflow:hidden;">
        <tr><td style="padding:0;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td width="25%" height="6" style="height:6px;line-height:6px;font-size:0;background:${C.pink};border-top-left-radius:23px;">&nbsp;</td>
            <td width="25%" height="6" style="height:6px;line-height:6px;font-size:0;background:${C.sun};">&nbsp;</td>
            <td width="25%" height="6" style="height:6px;line-height:6px;font-size:0;background:${C.sky};">&nbsp;</td>
            <td width="25%" height="6" style="height:6px;line-height:6px;font-size:0;background:${C.lime};border-top-right-radius:23px;">&nbsp;</td>
          </tr>
        </table>
        </td></tr>
        <tr><td style="padding:0;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr><td class="pl-pad" style="padding:36px 40px 36px 40px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr><td style="padding:0 0 16px 0;">
                <span class="pl-chip" style="display:inline-block;padding:5px 12px;border-radius:999px;background:${C.brandSoft};color:${C.brandDark};font-family:${SANS};font-size:11px;line-height:14px;font-weight:700;letter-spacing:${lang === 'th' ? '0' : '1.2px'};text-transform:uppercase;">${esc(o.eyebrow)}</span>
              </td></tr>
              <tr><td class="pl-fg pl-title" style="padding:0 0 14px 0;font-family:${DISPLAY};font-size:28px;line-height:34px;font-weight:700;color:${C.ink};">${esc(o.title)}</td></tr>
              <tr><td class="pl-muted" style="padding:0 0 26px 0;font-family:${SANS};font-size:15px;line-height:24px;color:${C.muted};">${o.introHtml}</td></tr>
              ${details}
              <tr><td style="padding:0 0 ${o.note ? '18px' : '6px'} 0;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" class="pl-btn-cell">
                  <tr><td align="center" bgcolor="${C.brand}" style="border-radius:16px;background:${C.brand};">
                    <a class="pl-btn" href="${esc(o.button.url)}" target="_blank" style="display:inline-block;padding:15px 30px;border-radius:16px;background:${C.brand};color:#FFFFFF;font-family:${SANS};font-size:15px;line-height:20px;font-weight:700;">${esc(o.button.label)}&nbsp;&rarr;</a>
                  </td></tr>
                </table>
              </td></tr>
              ${o.note ? `<tr><td class="pl-muted" style="padding:0;font-family:${SANS};font-size:13px;line-height:20px;color:${C.muted};">${esc(o.note)}</td></tr>` : ''}
            </table>
          </td></tr>
          <tr><td style="padding:0 40px;"><div class="pl-line" style="height:1px;line-height:1px;font-size:0;background:${C.line};">&nbsp;</div></td></tr>
          <tr><td class="pl-pad" style="padding:20px 40px 28px 40px;font-family:${SANS};font-size:12px;line-height:18px;color:${C.muted};">
            <span class="pl-muted" style="color:${C.muted};">${esc(o.fallbackLabel)}</span><br>
            <a class="pl-link" href="${esc(o.button.url)}" target="_blank" style="color:${C.brand};word-break:break-all;">${esc(o.button.url)}</a>
          </td></tr>
        </table>
        </td></tr>
       </table>
      </td></tr>

      <!-- Footer -->
      <tr><td align="center" style="padding:26px 24px 0 24px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
          <td width="8" height="8" style="width:8px;height:8px;border-radius:8px;background:${C.pink};font-size:0;line-height:0;">&nbsp;</td><td width="6" style="font-size:0;">&nbsp;</td>
          <td width="8" height="8" style="width:8px;height:8px;border-radius:8px;background:${C.sun};font-size:0;line-height:0;">&nbsp;</td><td width="6" style="font-size:0;">&nbsp;</td>
          <td width="8" height="8" style="width:8px;height:8px;border-radius:8px;background:${C.sky};font-size:0;line-height:0;">&nbsp;</td><td width="6" style="font-size:0;">&nbsp;</td>
          <td width="8" height="8" style="width:8px;height:8px;border-radius:8px;background:${C.lime};font-size:0;line-height:0;">&nbsp;</td>
        </tr></table>
      </td></tr>
      <tr><td align="center" class="pl-fg" style="padding:12px 24px 4px 24px;font-family:${DISPLAY};font-size:15px;line-height:20px;font-weight:600;color:${C.ink};">${esc(tagline)}</td></tr>
      <tr><td align="center" class="pl-muted" style="padding:4px 24px 0 24px;font-family:${SANS};font-size:12px;line-height:18px;color:${C.muted};">
        ${esc(o.footer)}<br>
        <a class="pl-link" href="${esc(site)}" target="_blank" style="color:${C.brand};font-weight:600;word-break:break-all;">${esc(host || 'plannity.space')}</a>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
}

/** Plain-text part (spam filters and text-only clients). */
function text(o) {
  const lines = [o.title, '', o.introText];
  for (const d of o.details || []) lines.push(`${d.label}: ${d.value}`);
  lines.push('', `${o.button.label}: ${o.button.url}`);
  if (o.note) lines.push('', o.note);
  lines.push('', '—', o.footer, 'Plannity · ' + String(o.siteUrl || '').replace(/\/$/, ''));
  return lines.join('\n');
}

module.exports = { layout, text, esc, C };
