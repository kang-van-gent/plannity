'use strict';

const { fail } = require('../../../utils/brand-access');

// Thin HTTP layer over services/task.js (all rules live there).
const svc = () => strapi.service('api::task.task');
const body = (ctx) => ctx.request.body?.data ?? ctx.request.body ?? {};

async function run(ctx, fn) {
  if (!ctx.state.user) return ctx.unauthorized();
  try {
    ctx.body = { data: await fn() };
  } catch (e) {
    if (e instanceof svc().TaskError) return fail(ctx, e.status, e.code, e.message, e.fieldErrors);
    throw e;
  }
}

module.exports = {
  forContent: (ctx) => run(ctx, () => svc().forContent(ctx.params.id, ctx.state.user)),
  create: (ctx) => run(ctx, () => svc().create(ctx.params.id, ctx.state.user, body(ctx))),
  mine: (ctx) => run(ctx, () => svc().mine(ctx.state.user)),
  forBrand: (ctx) => run(ctx, () => svc().forBrand(ctx.params.brandId, ctx.state.user)),
  updateAssignment: (ctx) => run(ctx, () => svc().updateAssignment(ctx.params.id, ctx.state.user, body(ctx))),
  transition: (ctx) => run(ctx, () => svc().transition(ctx.params.id, ctx.state.user, body(ctx))),
};
