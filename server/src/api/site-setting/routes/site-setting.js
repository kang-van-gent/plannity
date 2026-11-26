'use strict';

const { factories } = require('@strapi/strapi');

// Public, read-only (the website reads it to add Analytics / Search Console). Edited in the admin.
module.exports = factories.createCoreRouter('api::site-setting.site-setting', { only: ['find'] });
