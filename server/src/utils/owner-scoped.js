'use strict';

/**
 * Tenant isolation for user-owned collections (plannity-spec §4, §19).
 *
 * Every read/write is scoped to `ctx.state.user`. Resources owned by someone
 * else respond 404 (not 403) so IDs cannot be probed across tenants. The
 * owner is always taken from the session, never from the request body.
 */
const { factories } = require('@strapi/strapi');

/** Turns a Strapi relation payload into lookup filters ({documentId} or {id}). */
function relationRefs(value) {
  if (value === null || value === undefined) return [];
  if (Array.isArray(value)) return value.flatMap(relationRefs);
  if (typeof value === 'string') return [{ documentId: value }];
  if (typeof value === 'number') return [{ id: value }];
  if (typeof value === 'object') {
    if (value.connect || value.set) return [...relationRefs(value.connect), ...relationRefs(value.set)];
    if (value.documentId) return [{ documentId: value.documentId }];
    if (value.id) return [{ id: value.id }];
  }
  return [];
}

/**
 * @param {string} uid
 * @param {{ ownerField?: string, allowShared?: boolean, ownedRelations?: Record<string, string>, versioned?: boolean,
 *   validate?: (next: Record<string, any>, existing: Record<string, any> | null, data: Record<string, any>) => Record<string, string> | null }} [opts]
 *   ownedRelations: fields that may only point at records the same user owns,
 *   e.g. { brand: 'api::brand.brand' } so nobody can attach content to another tenant's brand.
 *   versioned: require `data.version` to match the stored version (optimistic concurrency) and bump it.
 *   validate: business rules returning field errors, answered with the spec error envelope.
 */
function ownerScopedController(uid, { ownerField = 'owner', allowShared = false, ownedRelations = {}, versioned = false, validate } = {}) {
  return factories.createCoreController(uid, ({ strapi }) => {
    const ownerFilter = (user) =>
      allowShared
        ? { $or: [{ [ownerField]: { id: user.id } }, { [ownerField]: { id: { $null: true } } }] }
        : { [ownerField]: { id: user.id } };

    async function findOwned(ctx, documentId, { write = false } = {}) {
      const user = ctx.state.user;
      // Shared rows (owner = null) are readable but never writable.
      const filters = write ? { documentId, [ownerField]: { id: user.id } } : { $and: [{ documentId }, ownerFilter(user)] };
      return strapi.documents(uid).findFirst({ filters });
    }

    async function relationsOwned(data, user) {
      for (const [field, target] of Object.entries(ownedRelations)) {
        for (const ref of relationRefs(data?.[field])) {
          // Brands and contents are shared through Team Workspace: membership is enough.
          const scope = target === 'api::brand.brand'
            ? { memberships: { user: { id: user.id }, status: 'active' } }
            : target === 'api::content.content'
              ? { brand: { memberships: { user: { id: user.id }, status: 'active' } } }
              : { owner: { id: user.id } };
          const row = await strapi.documents(target).findFirst({ filters: { ...ref, ...scope } });
          if (!row) return false;
        }
      }
      return true;
    }

    function fail(ctx, status, code, message, fieldErrors = {}) {
      ctx.status = status;
      ctx.body = { data: null, error: { status, code, message, fieldErrors, requestId: ctx.state.requestId ?? null } };
    }

    function stripOwner(data) {
      const { [ownerField]: _ignored, ...rest } = data || {};
      return rest;
    }

    return {
      async find(ctx) {
        const user = ctx.state.user;
        if (!user) return ctx.unauthorized();
        // Validate/sanitize the client's query first, then add the owner
        // constraint server-side (clients cannot filter on the users relation).
        await this.validateQuery(ctx);
        const query = await this.sanitizeQuery(ctx);
        const filters = query.filters ? { $and: [query.filters, ownerFilter(user)] } : ownerFilter(user);
        const { results, pagination } = await strapi.service(uid).find({ ...query, filters });
        const sanitized = await this.sanitizeOutput(results, ctx);
        return this.transformResponse(sanitized, { pagination });
      },

      async findOne(ctx) {
        if (!ctx.state.user) return ctx.unauthorized();
        if (!(await findOwned(ctx, ctx.params.id))) return ctx.notFound();
        return super.findOne(ctx);
      },

      async create(ctx) {
        const user = ctx.state.user;
        if (!user) return ctx.unauthorized();
        const data = stripOwner(ctx.request.body?.data);
        if (!(await relationsOwned(data, user))) return ctx.notFound('Related record not found');
        const fieldErrors = validate?.(data, null, data);
        if (fieldErrors && Object.keys(fieldErrors).length) return fail(ctx, 400, 'INVALID_INPUT', 'Invalid input', fieldErrors);
        if (versioned) data.version = 1;
        await this.validateInput(data, ctx);
        const sanitized = await this.sanitizeInput(data, ctx);
        const entity = await strapi.documents(uid).create({ data: { ...sanitized, [ownerField]: user.id } });
        const out = await this.sanitizeOutput(entity, ctx);
        return this.transformResponse(out);
      },

      async update(ctx) {
        if (!ctx.state.user) return ctx.unauthorized();
        const existing = await findOwned(ctx, ctx.params.id, { write: true });
        if (!existing) return ctx.notFound();
        const data = stripOwner(ctx.request.body?.data);
        if (!(await relationsOwned(data, ctx.state.user))) return ctx.notFound('Related record not found');
        if (versioned) {
          if (Number(data.version) !== Number(existing.version)) {
            return fail(ctx, 409, 'VERSION_CONFLICT', 'This record was changed elsewhere. Reload to get the latest version.');
          }
          data.version = Number(existing.version) + 1;
        }
        const fieldErrors = validate?.({ ...existing, ...data }, existing, data);
        if (fieldErrors && Object.keys(fieldErrors).length) return fail(ctx, 400, 'INVALID_INPUT', 'Invalid input', fieldErrors);
        ctx.request.body = { ...ctx.request.body, data };
        return super.update(ctx);
      },

      async delete(ctx) {
        if (!ctx.state.user) return ctx.unauthorized();
        if (!(await findOwned(ctx, ctx.params.id, { write: true }))) return ctx.notFound();
        return super.delete(ctx);
      },
    };
  });
}

module.exports = { ownerScopedController };
