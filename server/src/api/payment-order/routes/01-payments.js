'use strict';

// App-facing payment endpoints (signed-in user's own orders only).
module.exports = {
  routes: [
    { method: 'GET', path: '/payments/orders', handler: 'payment-order.myOrders' },
    { method: 'POST', path: '/payments/orders', handler: 'payment-order.createMine' },
    { method: 'GET', path: '/payments/orders/:id', handler: 'payment-order.findMine' },
    { method: 'POST', path: '/payments/orders/:id/slip', handler: 'payment-order.uploadSlip' },
    // Signed, expiring link for staff (HMAC-checked in the controller); slips are not in the public uploads folder.
    { method: 'GET', path: '/payments/slips/:attemptId', handler: 'payment-order.slipFile', config: { auth: false } },
  ],
};
