'use strict';

module.exports = {
  routes: [
    { method: 'GET', path: '/credits/balance', handler: 'credit-wallet.balance' },
    { method: 'GET', path: '/credits/ledger', handler: 'credit-wallet.ledger' },
  ],
};
