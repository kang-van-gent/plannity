'use strict';

/**
 * Notification seam for team invitations. Sends through Strapi's email plugin
 * when INVITE_EMAIL_ENABLED=true (configure a provider in config/plugins.js);
 * otherwise it only logs, and the inviter gets a copyable link in the UI.
 * Kept behind this function so a real notification system can replace it.
 */
async function sendInvitation(strapi, { to, brandName, inviterName, role, link, expiresAt }) {
  if (process.env.INVITE_EMAIL_ENABLED !== 'true') {
    strapi.log.info(`[team] invitation for ${to} → ${brandName} (${role}); email disabled, link returned to inviter`);
    return false;
  }
  const expires = new Date(expiresAt).toUTCString();
  try {
    await strapi.plugin('email').service('email').send({
      to,
      subject: `${inviterName} invited you to ${brandName} on Plannity`,
      text: `${inviterName} invited you to join "${brandName}" on Plannity as ${role}.\n\nAccept: ${link}\n\nThis invitation expires ${expires}.`,
      html: `<p><b>${escapeHtml(inviterName)}</b> invited you to join <b>${escapeHtml(brandName)}</b> on Plannity as <b>${escapeHtml(role)}</b>.</p>`
        + `<p><a href="${escapeHtml(link)}">Accept invitation</a></p><p style="color:#666">Expires ${escapeHtml(expires)}.</p>`,
    });
    return true;
  } catch (e) {
    strapi.log.warn(`[team] invitation email to ${to} failed: ${e.message}`);
    return false;
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

module.exports = { sendInvitation };
