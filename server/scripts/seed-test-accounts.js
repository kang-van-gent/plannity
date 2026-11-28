// LOCAL TESTING ONLY. Creates three sign-in accounts, one per plan, with brands
// and multi-platform posts, for testing Social channels and per-platform publishing.
//
//   cd server && node scripts/seed-test-accounts.js
//
// Safe to re-run: it deletes and re-creates the *.test accounts and their data.
// Stop `npm run develop` first only if Postgres complains about locks (normally not needed).
'use strict';

if (process.env.NODE_ENV === 'production') { console.error('Refusing to seed test accounts in production.'); process.exit(1); }

const { createStrapi, compileStrapi } = require('@strapi/strapi');
const destinations = require('../src/services/destinations');
const { invalidate } = require('../src/services/entitlements');

const PASSWORD = 'Plannity123!';
const DAY = 86400000;

const ACCOUNTS = [
  { email: 'solo@plannity.test', name: 'Solo Tester', plan: null, brands: [{ name: 'Solo Café', color: '#F59E0B' }] },
  { email: 'team@plannity.test', name: 'Team Tester', plan: 'team', brands: [{ name: 'Team Bakery', color: '#10B981' }] },
  { email: 'studio@plannity.test', name: 'Studio Tester', plan: 'studio', brands: [{ name: 'Studio Agency A', color: '#6C4CF5' }, { name: 'Studio Agency B', color: '#EC4899' }, { name: 'Studio Agency C', color: '#0EA5E9' }] },
];

const profile = (name) => ({
  usp: '', tone: 'Friendly', goals: 'Grow followers', pillars: ['Education', 'Promotion'], audience: 'Young adults in Bangkok',
  industry: 'Food & drink', language: 'th', products: '', platforms: ['facebook', 'instagram', 'tiktok'], guidelines: '',
  painPoints: '', competitors: '', description: `${name} (test brand)`, ctaPreferences: '', forbiddenWords: '',
});

// Each brand gets the same three posts: one platform, three platforms (none posted), three platforms (one posted).
const POSTS = [
  { title: 'Single platform post', platforms: ['facebook'], posted: [] },
  { title: 'Multi-platform draft', platforms: ['facebook', 'instagram', 'tiktok'], posted: [] },
  { title: 'Partly posted', platforms: ['facebook', 'instagram', 'tiktok'], posted: ['facebook'] },
];

(async () => {
  const app = await createStrapi(await compileStrapi()).load();
  const db = (uid) => app.documents(uid);
  try {
    const role = await app.db.query('plugin::users-permissions.role').findOne({ where: { type: 'authenticated' } });
    const userService = app.plugin('users-permissions').service('user');
    const users = {};

    for (const acc of ACCOUNTS) {
      await removeAccount(app, acc.email);
      const user = await userService.add({
        username: acc.email, email: acc.email, password: PASSWORD, provider: 'local', confirmed: true, blocked: false, role: role.id,
      });
      users[acc.email] = user;

      if (acc.plan) {
        const now = Date.now();
        await db('api::subscription.subscription').create({
          data: { owner: user.id, planKey: acc.plan, status: 'active', periodStart: new Date(now - DAY).toISOString(), periodEnd: new Date(now + 30 * DAY).toISOString() },
        });
      }
      invalidate(user.id);

      for (const [i, b] of acc.brands.entries()) {
        const brand = await db('api::brand.brand').create({ data: { name: b.name, color: b.color, profile: profile(b.name), owner: user.id } });
        await db('api::brand-membership.brand-membership').create({
          data: { brand: brand.documentId, user: user.id, role: 'owner', status: 'active', joinedAt: new Date().toISOString(), memberKey: `${brand.documentId}:${user.id}` },
        });
        b.documentId = brand.documentId;
        for (const [j, p] of POSTS.entries()) await createPost(app, brand, user, p, i * 10 + j);
      }
      console.log(`✓ ${acc.email}  plan=${acc.plan ?? 'solo'}  brands=${acc.brands.map((b) => b.name).join(', ')}`);
    }

    // Member views: Solo user joins Team Bakery as an Editor (sees "only owners/admins can connect").
    const teamBrand = ACCOUNTS[1].brands[0].documentId;
    const solo = users['solo@plannity.test'];
    await db('api::brand-membership.brand-membership').create({
      data: { brand: teamBrand, user: solo.id, role: 'editor', status: 'active', joinedAt: new Date().toISOString(), memberKey: `${teamBrand}:${solo.id}` },
    });
    invalidate();
    console.log('✓ solo@plannity.test is also an Editor in "Team Bakery"');
    console.log(`\nPassword for all three: ${PASSWORD}`);
  } finally {
    await app.destroy();
    process.exit(0);
  }
})().catch((e) => { console.error('Seed failed:', e); process.exit(1); });

async function createPost(app, brand, user, p, offset) {
  const date = new Date(Date.now() + (offset + 1) * DAY).toISOString().slice(0, 10);
  const content = await app.documents('api::content.content').create({
    data: {
      title: p.title, platform: p.platforms[0], format: 'static', status: 'draft', version: 1, source: 'manual',
      caption: `${p.title} — caption for testing.`, hashtags: ['#plannity', '#test'], scheduledDate: date, scheduledTime: '10:00',
      brand: brand.documentId, owner: user.id, lastEditedBy: user.id,
    },
    populate: { brand: { fields: ['documentId'] } },
  });
  await destinations.ensureFor(app, content.documentId);
  if (p.platforms.length > 1) {
    await destinations.applySet(app, content, p.platforms.map((platform) => ({ platform, captionOverride: null, mediaOverrideIds: null, scheduledAt: null, timezone: 'Asia/Bangkok' })), user);
  }
  for (const platform of p.posted) {
    const dest = (await destinations.listFor(app, content.documentId)).find((d) => d.platform === platform);
    const fresh = await app.documents('api::content.content').findOne({ documentId: content.documentId, populate: { brand: { fields: ['documentId'] } } });
    await destinations.markPublished(app, fresh, dest, { published: true, postUrl: `https://www.${platform}.com/test-post` }, user);
  }
}

async function removeAccount(app, email) {
  const user = await app.db.query('plugin::users-permissions.user').findOne({ where: { email } });
  if (!user) return;
  const brands = await app.documents('api::brand.brand').findMany({ filters: { owner: { id: user.id } }, limit: 100 });
  for (const b of brands) {
    for (const uid of ['api::social-connection.social-connection', 'api::social-connection.social-auth-request', 'api::publish-destination.publish-destination', 'api::content.content', 'api::brand-membership.brand-membership', 'api::brand-invitation.brand-invitation', 'api::activity-log.activity-log']) {
      const rows = await app.documents(uid).findMany({ filters: { brand: { documentId: b.documentId } }, limit: 1000 });
      for (const r of rows) await app.documents(uid).delete({ documentId: r.documentId });
    }
    await app.documents('api::brand.brand').delete({ documentId: b.documentId });
  }
  for (const uid of ['api::subscription.subscription', 'api::brand-membership.brand-membership']) {
    const rows = await app.documents(uid).findMany({ filters: uid.includes('membership') ? { user: { id: user.id } } : { owner: { id: user.id } }, limit: 1000 });
    for (const r of rows) await app.documents(uid).delete({ documentId: r.documentId });
  }
  await app.db.query('plugin::users-permissions.user').delete({ where: { id: user.id } });
}
