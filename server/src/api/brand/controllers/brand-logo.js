'use strict';

/**
 * Brand logo (brand.update — owners and admins):
 *   POST   /brands/:id/logo   multipart "file" (JPG/PNG/WEBP/GIF, ≤ 5 MB) → 400×400 WebP, transparency kept
 *   DELETE /brands/:id/logo   back to the coloured initials
 * → { data: { id, logoUrl } }
 */
const fs = require('node:fs');
const { requireBrand, fail } = require('../../../utils/brand-access');
const { sniffImageType } = require('../../../utils/image-type');
const { squareWebp, absoluteUrl } = require('../../../utils/square-image');
const { record } = require('../../../services/activity');

const BRAND = 'api::brand.brand';
const MAX_BYTES = 5 * 1024 * 1024;

async function currentLogo(documentId) {
  const b = await strapi.documents(BRAND).findOne({ documentId, populate: { logo: true } });
  return b?.logo ?? null;
}
async function dropFile(file) {
  if (!file) return;
  try { await strapi.plugin('upload').service('upload').remove(file); } catch (e) { strapi.log.warn(`[brand-logo] could not delete old logo ${file.id}: ${e.message}`); }
}
const log = (brand, user, from, to) => record(strapi, {
  brandId: brand.documentId, actor: user, action: 'brand.updated', entityType: 'brand', entityId: brand.documentId, entityTitle: brand.name,
  changes: [{ field: 'logo', from, to }],
}).catch(() => {});

module.exports = {
  async upload(ctx) {
    const ok = await requireBrand(ctx, ctx.params.id, 'brand.update');
    if (!ok) return;
    if (ok.brand.archivedAt) return fail(ctx, 409, 'CONFLICT', 'This brand is archived');
    const f = ctx.request.files?.file;
    const file = Array.isArray(f) ? f[0] : f;
    if (!file) return fail(ctx, 400, 'INVALID_INPUT', 'No image received', { file: 'required' });
    const head = Buffer.alloc(16);
    const fd = fs.openSync(file.filepath, 'r');
    try { fs.readSync(fd, head, 0, 16, 0); } finally { fs.closeSync(fd); }
    if (!sniffImageType(head)) return fail(ctx, 400, 'FILE_TYPE', 'Use a JPG, PNG, WEBP or GIF image', { file: 'file_type' });
    if (file.size > MAX_BYTES) return fail(ctx, 400, 'FILE_TOO_LARGE', 'The logo must be 5 MB or smaller', { file: 'too_large' });

    let prepared;
    try {
      prepared = await squareWebp(file, { size: 400, fit: 'contain', name: `brand-logo-${ok.brand.documentId}` });
    } catch {
      return fail(ctx, 400, 'FILE_TYPE', 'This image could not be read', { file: 'unreadable' });
    }
    try {
      const old = await currentLogo(ok.brand.documentId);
      const [uploaded] = await strapi.plugin('upload').service('upload').upload({
        data: { fileInfo: { name: prepared.file.originalFilename, alternativeText: `${ok.brand.name} logo` } }, files: prepared.file,
      });
      const logoUrl = absoluteUrl(uploaded.url);
      await strapi.documents(BRAND).update({ documentId: ok.brand.documentId, data: { logo: uploaded.id, logoUrl } });
      await dropFile(old);
      await log(ok.brand, ctx.state.user, old ? 'logo' : null, 'logo');
      ctx.body = { data: { id: ok.brand.documentId, logoUrl } };
    } finally {
      prepared.cleanup();
    }
  },

  async remove(ctx) {
    const ok = await requireBrand(ctx, ctx.params.id, 'brand.update');
    if (!ok) return;
    const old = await currentLogo(ok.brand.documentId);
    await strapi.documents(BRAND).update({ documentId: ok.brand.documentId, data: { logo: null, logoUrl: null } });
    await dropFile(old);
    if (old) await log(ok.brand, ctx.state.user, 'logo', null);
    ctx.body = { data: { id: ok.brand.documentId, logoUrl: null } };
  },
};
