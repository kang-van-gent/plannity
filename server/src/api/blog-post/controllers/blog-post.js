'use strict';

const { factories } = require('@strapi/strapi');

// Public, read-only. The REST API would otherwise let anyone ask for
// `?status=draft`, so published content is enforced here — drafts stay in the admin.
module.exports = factories.createCoreController('api::blog-post.blog-post', () => ({
  async find(ctx) {
    ctx.query = { ...ctx.query, status: 'published' };
    return super.find(ctx);
  },
  async findOne(ctx) {
    ctx.query = { ...ctx.query, status: 'published' };
    return super.findOne(ctx);
  },
}));
