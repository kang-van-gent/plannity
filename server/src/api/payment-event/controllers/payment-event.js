'use strict';

// Internal collection: written only by custom services. Do not grant public/authenticated
// permissions on these core routes in the Users & Permissions plugin.
const { factories } = require('@strapi/strapi');

module.exports = factories.createCoreController('api::payment-event.payment-event');
