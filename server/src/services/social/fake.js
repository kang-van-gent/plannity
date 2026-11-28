'use strict';

/**
 * LOCAL TESTING ONLY (SOCIAL_FAKE=true, refused in production): answers the
 * Meta and TikTok calls the adapters make with realistic canned data, so
 * Connect → choose a Page → Test connection can be clicked through without
 * real developer apps. Nothing leaves the machine.
 *
 * Pages offered by "Meta":
 *  - Demo Café (Page + Instagram @democafe)
 *  - Demo Shop (Page only, no Instagram linked)
 *  - Broken Page (its token is "revoked": Test connection fails → Reconnect required)
 */
const { SocialError } = require('./http');

const PAGES = [
  { id: '1110001', name: 'Demo Café', access_token: 'fake-page-token-1110001', tasks: ['CREATE_CONTENT', 'MANAGE'], picture: { data: { url: null } }, instagram_business_account: { id: '1784000111', username: 'democafe', name: 'Demo Café', profile_picture_url: null } },
  { id: '1110002', name: 'Demo Shop', access_token: 'fake-page-token-1110002', tasks: ['CREATE_CONTENT'], picture: { data: { url: null } } },
  { id: '1110003', name: 'Broken Page', access_token: 'fake-revoked-1110003', tasks: ['CREATE_CONTENT'], picture: { data: { url: null } }, instagram_business_account: { id: '1784000333', username: 'brokenpage', name: 'Broken Page', profile_picture_url: null } },
];
const SCOPES = ['pages_show_list', 'pages_manage_posts', 'pages_read_engagement', 'instagram_basic', 'instagram_content_publish'];

async function respond(url, { headers = {}, form, classify }) {
  const u = new URL(url);
  const q = Object.fromEntries(u.searchParams);
  const fail = (status, body) => { throw classify(status, body) || new SocialError('invalid', `http_${status}`, 'fake error'); };

  if (u.hostname === 'graph.facebook.com') {
    const path = u.pathname.replace(/^\/v[\d.]+/, '');
    const token = q.access_token || '';
    if (path === '/oauth/access_token') return { access_token: q.fb_exchange_token ? 'fake-long-user-token' : 'fake-user-token', token_type: 'bearer', expires_in: 5183944 };
    if (path === '/debug_token') {
      const valid = !String(q.input_token).includes('revoked');
      return { data: { is_valid: valid, scopes: valid ? SCOPES : [], type: 'PAGE' } };
    }
    if (token.includes('revoked')) fail(400, { error: { message: 'Error validating access token: The user has not authorized application.', type: 'OAuthException', code: 190, error_subcode: 458 } });
    if (path === '/me/permissions') return { data: SCOPES.map((permission) => ({ permission, status: 'granted' })) };
    if (path === '/me/accounts') return { data: PAGES, paging: {} };
    const quota = /^\/(\d+)\/content_publishing_limit$/.exec(path);
    if (quota) return { data: [{ quota_usage: 3, config: { quota_total: 50, quota_duration: 86400 } }] };
    const node = /^\/(\d+)$/.exec(path);
    if (node) {
      const page = PAGES.find((p) => p.id === node[1]);
      if (page) return { id: page.id, name: page.name, picture: page.picture };
      const ig = PAGES.map((p) => p.instagram_business_account).find((i) => i?.id === node[1]);
      if (ig) return ig;
      fail(400, { error: { message: 'Unsupported get request.', type: 'GraphMethodException', code: 100, error_subcode: 33 } });
    }
  }

  if (u.hostname === 'open.tiktokapis.com') {
    const bearer = String(headers.authorization || '').replace(/^Bearer /, '');
    const ok = { code: 'ok', message: '' };
    if (u.pathname === '/v2/oauth/token/') {
      return { access_token: `fake-tt-access-${Date.now()}`, refresh_token: `fake-tt-refresh-${Date.now()}`, expires_in: 7200, refresh_expires_in: 15552000, open_id: 'fake-open-id-777', scope: 'user.info.basic,video.publish', token_type: 'Bearer' };
    }
    if (u.pathname === '/v2/oauth/revoke/') return {};
    if (!bearer.startsWith('fake-tt-access')) fail(401, { error: { code: 'access_token_invalid', message: 'The access token is invalid or not found in the request.' } });
    if (u.pathname === '/v2/user/info/') return { data: { user: { open_id: 'fake-open-id-777', display_name: 'Demo Creator', username: 'democreator', avatar_url: null } }, error: ok };
    if (u.pathname === '/v2/post/publish/creator_info/query/') {
      return { data: { creator_nickname: 'Demo Creator', creator_username: 'democreator', creator_avatar_url: null, privacy_level_options: ['FOLLOWER_OF_CREATOR', 'MUTUAL_FOLLOW_FRIENDS', 'SELF_ONLY'], comment_disabled: false, duet_disabled: false, stitch_disabled: true, max_video_post_duration_sec: 600 }, error: ok };
    }
  }
  void form;
  throw new SocialError('invalid', 'fake_unknown_call', `The fake provider has no answer for ${u.hostname}${u.pathname}`);
}

module.exports = { respond, PAGES };
