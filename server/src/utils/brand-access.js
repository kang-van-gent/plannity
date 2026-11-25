'use strict';

/**
 * Team Workspace authorization. A user's rights come from their *active
 * membership in the record's brand*, mapped through utils/permissions.js.
 *
 *  - Not a member (or record missing)  → 404, so ids can't be probed across brands.
 *  - Member whose role lacks the right → 403.
 *
 * The brand-scoped controller replaces owner-scoping for brand, content and
 * content-revision. `owner` on those rows now means "created by" (attribution).
 */
const { factories } = require('@strapi/strapi');
const { roleCan } = require('./permissions');
const { record } = require('../services/activity');

const MEMBERSHIP = 'api::brand-membership.brand-membership';

/** Wraps `leaf` in the relation path, e.g. nest('content.brand', x) → { content: { brand: x } }. */
function nest(path, leaf) {
  return path ? path.split('.').reduceRight((acc, key) => ({ [key]: acc }), leaf) : leaf;
}
const memberLeaf = (userId) => ({ memberships: { user: { id: userId }, status: 'active' } });

async function roleFor(strapi, brandDocumentId, userId) {
  if (!brandDocumentId || !userId) return null;
  const m = await strapi.documents(MEMBERSHIP).findFirst({
    filters: { brand: { documentId: brandDocumentId }, user: { id: userId }, status: 'active' },
    fields: ['role'],
  });
  return m ? m.role : null;
}

/** brandDocumentId → role, for every brand the user belongs to. */
async function rolesFor(strapi, userId) {
  const rows = await strapi.documents(MEMBERSHIP).findMany({
    filters: { user: { id: userId }, status: 'active' },
    fields: ['role'],
    populate: { brand: { fields: ['documentId'] } },
    limit: 1000,
  });
  return new Map(rows.filter((r) => r.brand).map((r) => [r.brand.documentId, r.role]));
}

function fail(ctx, status, code, message, fieldErrors = {}) {
  ctx.status = status;
  ctx.body = { data: null, error: { status, code, message, fieldErrors, requestId: ctx.state.requestId ?? null } };
  return null;
}

/**
 * Loads the brand and checks the current user's permission on it.
 * Returns { brand, role } or answers the request (404/403) and returns null.
 */
async function requireBrand(ctx, brandDocumentId, perm) {
  const user = ctx.state.user;
  if (!user) return fail(ctx, 401, 'UNAUTHENTICATED', 'Please sign in');
  const brand = brandDocumentId ? await strapi.documents('api::brand.brand').findOne({ documentId: brandDocumentId }) : null;
  const role = brand ? await roleFor(strapi, brand.documentId, user.id) : null;
  if (!brand || !role) return fail(ctx, 404, 'NOT_FOUND', 'Brand not found');
  if (!roleCan(role, perm)) return fail(ctx, 403, 'FORBIDDEN', 'Your role in this brand does not allow this');
  return { brand, role };
}

/** Same for a content item (permission is evaluated on its brand). */
async function requireContent(ctx, contentDocumentId, perm, populate = {}) {
  const user = ctx.state.user;
  if (!user) return fail(ctx, 401, 'UNAUTHENTICATED', 'Please sign in');
  const content = contentDocumentId
    ? await strapi.documents('api::content.content').findOne({ documentId: contentDocumentId, populate: { brand: { fields: ['documentId'] }, ...populate } })
    : null;
  const role = content?.brand ? await roleFor(strapi, content.brand.documentId, user.id) : null;
  if (!content || !role) return fail(ctx, 404, 'NOT_FOUND', 'Content not found');
  if (!roleCan(role, perm)) return fail(ctx, 403, 'FORBIDDEN', 'Your role in this brand does not allow this');
  return { content, role };
}

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
 * Core controller whose rows belong to a brand reached via `brandPath`
 * ('' = the row *is* the brand, 'brand' = content, 'content.brand' = revision).
 *
 * @param {string} uid
 * @param {{
 *   brandPath: string,
 *   perms: { read: string, create?: string, update: string | ((data) => string), delete: string },
 *   protectedFields?: string[],           // never writable through this API
 *   versioned?: boolean,                  // optimistic concurrency on `version`
 *   validate?: (next, existing, data) => Record<string, string> | null,
 *   onCreate?: (entity, user) => Promise<void>,
 *   audit?: {                             // activity log: who did what, when
 *     entityType: 'brand' | 'content',
 *     title: (row) => string,
 *     diff: (before, data) => { field, from, to }[],
 *     classify: (changes) => string | null,  // null = nothing worth logging
 *   },
 * }} opts
 */
function brandScopedController(uid, { brandPath, perms, protectedFields = [], versioned = false, validate, onCreate, audit }) {
  return factories.createCoreController(uid, ({ strapi }) => {
    const brandOf = (row) => (brandPath ? brandPath.split('.').reduce((acc, k) => acc?.[k], row) : row);
    // nest('content.brand', x) is { content: { brand: x } }; Strapi wants { content: { populate: { brand: x } } }.
    const toPopulate = (path) => {
      if (!path) return undefined;
      const [head, ...rest] = path.split('.');
      return rest.length ? { [head]: { populate: toPopulate(rest.join('.')) } } : { [head]: { fields: ['documentId'] } };
    };

    async function load(ctx, documentId, perm) {
      const user = ctx.state.user;
      const row = await strapi.documents(uid).findOne({ documentId, populate: toPopulate(brandPath) });
      const brand = row ? brandOf(row) : null;
      const role = brand ? await roleFor(strapi, brand.documentId, user.id) : null;
      if (!row || !role) return fail(ctx, 404, 'NOT_FOUND', 'Not found');
      const need = typeof perm === 'function' ? perm(ctx.request.body?.data ?? {}) : perm;
      if (!roleCan(role, need)) return fail(ctx, 403, 'FORBIDDEN', 'Your role in this brand does not allow this');
      return { row, role };
    }

    function clean(data) {
      const out = { ...(data || {}) };
      for (const f of ['owner', 'lastEditedBy', ...protectedFields]) delete out[f];
      return out;
    }

    async function decorate(ctx, body) {
      // Brands carry the viewer's role and the effective seat limit.
      if (uid !== 'api::brand.brand' || !body?.data) return body;
      const roles = await rolesFor(strapi, ctx.state.user.id);
      const seats = Number(process.env.TEAM_DEFAULT_SEATS || 5);
      const add = (b) => ({ ...b, myRole: roles.get(b.documentId) ?? null, maxSeats: b.maxSeats ?? seats });
      body.data = Array.isArray(body.data) ? body.data.map(add) : add(body.data);
      return body;
    }

    return {
      async find(ctx) {
        const user = ctx.state.user;
        if (!user) return ctx.unauthorized();
        await this.validateQuery(ctx);
        const query = await this.sanitizeQuery(ctx);
        // Membership constraint is added server-side; clients can't filter on users.
        const scope = nest(brandPath, memberLeaf(user.id));
        const filters = query.filters ? { $and: [query.filters, scope] } : scope;
        const { results, pagination } = await strapi.service(uid).find({ ...query, filters });
        const sanitized = await this.sanitizeOutput(results, ctx);
        return decorate(ctx, this.transformResponse(sanitized, { pagination }));
      },

      async findOne(ctx) {
        if (!ctx.state.user) return ctx.unauthorized();
        if (!(await load(ctx, ctx.params.id, perms.read))) return;
        return decorate(ctx, await super.findOne(ctx));
      },

      async create(ctx) {
        const user = ctx.state.user;
        if (!user) return ctx.unauthorized();
        const data = clean(ctx.request.body?.data);
        let parentBrandId = null;
        if (brandPath) {
          // The new row's brand must be one where the user may create.
          const refs = relationRefs(data[brandPath.split('.')[0]]);
          if (refs.length !== 1) return fail(ctx, 400, 'INVALID_INPUT', 'Brand is required', { brand: 'required' });
          const brand = await strapi.documents('api::brand.brand').findFirst({ filters: refs[0] });
          parentBrandId = brand?.documentId ?? null;
          const role = brand ? await roleFor(strapi, brand.documentId, user.id) : null;
          if (!brand || !role) return fail(ctx, 404, 'NOT_FOUND', 'Brand not found');
          if (!roleCan(role, perms.create)) return fail(ctx, 403, 'FORBIDDEN', 'Your role in this brand does not allow this');
        }
        const fieldErrors = validate?.(data, null, data);
        if (fieldErrors && Object.keys(fieldErrors).length) return fail(ctx, 400, 'INVALID_INPUT', 'Invalid input', fieldErrors);
        if (versioned) data.version = 1;
        await this.validateInput(data, ctx);
        const sanitized = await this.sanitizeInput(data, ctx);
        const entity = await strapi.db.transaction(async () => {
          const created = await strapi.documents(uid).create({ data: { ...sanitized, owner: user.id } });
          if (onCreate) await onCreate(created, user);
          if (audit) {
            await record(strapi, {
              brandId: parentBrandId ?? created.documentId, actor: user, action: `${audit.entityType}.created`,
              entityType: audit.entityType, entityId: created.documentId, entityTitle: audit.title(created),
            });
          }
          return created;
        });
        const out = await this.sanitizeOutput(entity, ctx);
        return decorate(ctx, this.transformResponse(out));
      },

      async update(ctx) {
        if (!ctx.state.user) return ctx.unauthorized();
        const ok = await load(ctx, ctx.params.id, perms.update);
        if (!ok) return;
        const existing = ok.row;
        const data = clean(ctx.request.body?.data);
        if (brandPath && data[brandPath.split('.')[0]] !== undefined) {
          // Moving to another brand needs create rights there.
          const refs = relationRefs(data[brandPath.split('.')[0]]);
          const brand = refs[0] ? await strapi.documents('api::brand.brand').findFirst({ filters: refs[0] }) : null;
          const role = brand ? await roleFor(strapi, brand.documentId, ctx.state.user.id) : null;
          if (!brand || !role) return fail(ctx, 404, 'NOT_FOUND', 'Brand not found');
          if (!roleCan(role, perms.create)) return fail(ctx, 403, 'FORBIDDEN', 'Your role in that brand does not allow this');
        }
        if (versioned) {
          if (Number(data.version) !== Number(existing.version)) {
            return fail(ctx, 409, 'VERSION_CONFLICT', 'This record was changed elsewhere. Reload to get the latest version.');
          }
          data.version = Number(existing.version) + 1;
        }
        const fieldErrors = validate?.({ ...existing, ...data }, existing, data);
        if (fieldErrors && Object.keys(fieldErrors).length) return fail(ctx, 400, 'INVALID_INPUT', 'Invalid input', fieldErrors);
        const changes = audit ? audit.diff(existing, data) : [];
        if (uid === 'api::content.content') data.lastEditedBy = ctx.state.user.id;
        ctx.request.body = { ...ctx.request.body, data };
        const res = await super.update(ctx);
        const action = audit && audit.classify(changes);
        if (action) {
          await record(strapi, {
            brandId: brandOf(existing)?.documentId, actor: ctx.state.user, action, entityType: audit.entityType,
            entityId: existing.documentId, entityTitle: audit.title({ ...existing, ...data }), changes,
          });
        }
        return decorate(ctx, res);
      },

      async delete(ctx) {
        if (!ctx.state.user) return ctx.unauthorized();
        const ok = await load(ctx, ctx.params.id, perms.delete);
        if (!ok) return;
        const res = await super.delete(ctx);
        if (audit && uid !== 'api::brand.brand') {
          await record(strapi, {
            brandId: brandOf(ok.row)?.documentId, actor: ctx.state.user, action: `${audit.entityType}.deleted`,
            entityType: audit.entityType, entityId: ok.row.documentId, entityTitle: audit.title(ok.row),
          });
        }
        return res;
      },
    };
  });
}

module.exports = { brandScopedController, requireBrand, requireContent, roleFor, rolesFor, relationRefs, fail, nest, MEMBERSHIP };
