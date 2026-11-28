'use strict';

/**
 * Notification seam for team invitations. Emails through Brevo (services/mail)
 * when mail is switched on and configured (App settings → Mail); otherwise it
 * only logs, and the inviter gets a copyable link in the UI.
 * Kept behind this function so a real notification system can replace it.
 */
const mail = require('./mail');

async function sendInvitation(strapi, { to, brandName, inviterName, inviterLocale, role, link, expiresAt }) {
  if (!mail.ready()) {
    strapi.log.info(`[team] invitation for ${to} → ${brandName} (${role}); email off, link returned to inviter`);
    return false;
  }
  // Written in the invitee's language when they already have an account, else the inviter's.
  const existing = await mail.account(strapi, to);
  return mail.sendTemplate(strapi, 'invitation', to, {
    locale: existing?.locale || inviterLocale, inviterName, brandName, role, link, expiresAt,
  }, { tags: ['team-invitation'] });
}

module.exports = { sendInvitation };
