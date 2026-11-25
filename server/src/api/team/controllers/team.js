'use strict';

const { requireBrand, fail } = require('../../../utils/brand-access');

// Thin HTTP layer over services/team.js. Permission per action comes from the
// caller's membership in :brandId (backend-enforced; the UI only mirrors it).
const svc = () => strapi.service('api::team.team');

async function run(ctx, fn) {
  try {
    const out = await fn();
    ctx.body = out === undefined ? { data: { ok: true } } : { data: out };
  } catch (e) {
    if (e instanceof svc().TeamError) return fail(ctx, e.status, e.code, e.message, e.fieldErrors);
    throw e;
  }
}

module.exports = {
  async get(ctx) {
    const ok = await requireBrand(ctx, ctx.params.brandId, 'member.read');
    if (ok) await run(ctx, () => svc().summary(ok.brand, ctx.state.user.id));
  },
  async invite(ctx) {
    const ok = await requireBrand(ctx, ctx.params.brandId, 'brand.read'); // role checked in the service (invite + role rules)
    if (ok) await run(ctx, () => svc().invite(ok.brand, ctx.state.user, ok.role, ctx.request.body?.data ?? ctx.request.body));
  },
  async resend(ctx) {
    const ok = await requireBrand(ctx, ctx.params.brandId, 'member.invite');
    if (ok) await run(ctx, () => svc().resend(ok.brand, ctx.state.user, ctx.params.id));
  },
  async cancel(ctx) {
    const ok = await requireBrand(ctx, ctx.params.brandId, 'member.invite');
    if (ok) await run(ctx, () => svc().cancel(ok.brand, ctx.state.user, ctx.params.id));
  },
  async updateRole(ctx) {
    const ok = await requireBrand(ctx, ctx.params.brandId, 'brand.read');
    const role = (ctx.request.body?.data ?? ctx.request.body)?.role;
    if (ok) await run(ctx, () => svc().updateRole(ok.brand, ctx.state.user, ok.role, ctx.params.memberId, role));
  },
  async removeMember(ctx) {
    const ok = await requireBrand(ctx, ctx.params.brandId, 'brand.read');
    if (ok) await run(ctx, () => svc().removeMember(ok.brand, ctx.state.user, ok.role, ctx.params.memberId));
  },
  async leave(ctx) {
    const ok = await requireBrand(ctx, ctx.params.brandId, 'brand.read');
    if (ok) await run(ctx, () => svc().leave(ok.brand, ctx.state.user));
  },
  async mine(ctx) {
    if (!ctx.state.user) return ctx.unauthorized();
    await run(ctx, () => svc().mine(ctx.state.user));
  },
  async acceptMine(ctx) {
    if (!ctx.state.user) return ctx.unauthorized();
    await run(ctx, async () => svc().accept(await svc().mineById(ctx.state.user, ctx.params.id), ctx.state.user));
  },
  async declineMine(ctx) {
    if (!ctx.state.user) return ctx.unauthorized();
    await run(ctx, async () => svc().decline(await svc().mineById(ctx.state.user, ctx.params.id), ctx.state.user));
  },
  async preview(ctx) {
    await run(ctx, async () => svc().preview(await svc().byToken(ctx.params.token)));
  },
  async accept(ctx) {
    if (!ctx.state.user) return ctx.unauthorized();
    await run(ctx, async () => svc().accept(await svc().byToken(ctx.params.token), ctx.state.user));
  },
  async decline(ctx) {
    if (!ctx.state.user) return ctx.unauthorized();
    await run(ctx, async () => svc().decline(await svc().byToken(ctx.params.token), ctx.state.user));
  },
};
