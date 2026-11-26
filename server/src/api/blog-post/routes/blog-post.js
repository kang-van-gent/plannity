'use strict';

const { factories } = require('@strapi/strapi');

// Read-only on the content API; posts are written in the Strapi admin.
module.exports = factories.createCoreRouter('api::blog-post.blog-post', { only: ['find', 'findOne'] });
