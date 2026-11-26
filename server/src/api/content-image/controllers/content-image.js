'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { requireContent, fail } = require('../../../utils/brand-access');
const { record } = require('../../../services/activity');

/** Activity entry for an image change on a post. */
const logImage = (ctx, content, action, changes) => record(strapi, {
  brandId: content.brand?.documentId, actor: ctx.state.user, action, entityType: 'content',
  entityId: content.documentId, entityTitle: content.title, changes,
});

const CONTENT = 'api::content.content';
const { sniffImageType: sniff, ALLOWED_IMAGE_TYPES: ALLOWED } = require('../../../utils/image-type');
const maxBytes = () => Number(process.env.CONTENT_IMAGE_MAX_MB || 10) * 1024 * 1024;
const maxCount = () => Number(process.env.CONTENT_IMAGE_MAX_COUNT || 10);

function headBytes(file) {
  const fd = fs.openSync(file.filepath, 'r');
  try {
    const buf = Buffer.alloc(16);
    const n = fs.readSync(fd, buf, 0, 16, 0);
    return buf.subarray(0, n);
  } finally {
    fs.closeSync(fd);
  }
}

/** Uploaded files from multipart field "files" (one or many). */
function filesOf(ctx) {
  const f = ctx.request.files?.files;
  return f ? (Array.isArray(f) ? f : [f]) : [];
}

function checkFiles(ctx, files) {
  if (!files.length) return fail(ctx, 400, 'INVALID_INPUT', 'No image received', { files: 'required' });
  for (const f of files) {
    const name = f.originalFilename || 'image';
    const type = sniff(headBytes(f));
    if (!type || !ALLOWED.includes(type)) return fail(ctx, 400, 'FILE_TYPE', `"${name}" isn't a JPG, PNG, WEBP or GIF image.`);
    if (f.size > maxBytes()) return fail(ctx, 400, 'FILE_TOO_LARGE', `"${name}" is larger than ${Math.round(maxBytes() / 1048576)} MB.`);
    f.mimetype = type; // store the verified type
  }
  return true;
}

/** Response shape for the app (no internal paths). */
function view(file) {
  const thumb = file.formats?.thumbnail?.url || file.formats?.small?.url || file.url;
  return {
    id: String(file.id), filename: file.name, mimeType: file.mime, size: Math.round((file.size || 0) * 1024),
    width: file.width ?? null, height: file.height ?? null, url: file.url, thumbnailUrl: thumb, createdAt: file.createdAt,
  };
}

const { orderImages } = require('../../../utils/image-order');

async function imagesOf(contentDocumentId) {
  const c = await strapi.documents(CONTENT).findOne({ documentId: contentDocumentId, populate: { images: true } });
  return c ? orderImages(c.images, c.imageOrder) : [];
}

/** Saves the images and their order (Strapi doesn't keep media relation order on its own). */
async function setImages(contentDocumentId, ids, userId) {
  const c = await strapi.documents(CONTENT).update({
    documentId: contentDocumentId, data: { images: ids, imageOrder: ids.map(String), lastEditedBy: userId }, populate: { images: true },
  });
  return orderImages(c.images, ids.map(String)).map(view);
}

/**
 * Multipart parsing and the upload service can both reorder files; the app sends
 * the order they were picked in (`order`: [{ name, size }]) so the post keeps it.
 */
function inPickedOrder(ctx, files, uploaded) {
  let picked = [];
  try { picked = JSON.parse(String(ctx.request.body?.order ?? '[]')); } catch { picked = []; }
  if (!Array.isArray(picked) || !picked.length) picked = files.map((f) => ({ name: f.originalFilename || f.name, size: f.size }));
  const pool = [...uploaded];
  const out = [];
  for (const p of picked) {
    const close = (u) => u.name === p.name && Math.abs(Number(u.size) * 1024 - Number(p.size)) < 1024;
    let i = pool.findIndex(close);
    if (i < 0) i = pool.findIndex((u) => u.name === p.name);
    if (i >= 0) out.push(...pool.splice(i, 1));
  }
  return [...out, ...pool];
}

async function upload(files) {
  return strapi.plugin('upload').service('upload').upload({ data: {}, files });
}

/** Delete the stored file only if no other content still uses it. */
async function dropIfUnused(fileId) {
  const users = await strapi.documents(CONTENT).count({ filters: { images: { id: fileId } } });
  if (users > 0) return;
  const file = await strapi.db.query('plugin::upload.file').findOne({ where: { id: fileId } });
  if (file) await strapi.plugin('upload').service('upload').remove(file);
}

async function guarded(ctx, fn) {
  try {
    return await fn();
  } catch (e) {
    strapi.log.error(`[content-image] ${e.message}`);
    return fail(ctx, 502, 'STORAGE', 'The image could not be stored. Please try again.');
  }
}

module.exports = {
  async upload(ctx) {
    const ok = await requireContent(ctx, ctx.params.id, 'contentImage.upload');
    if (!ok) return;
    const files = filesOf(ctx);
    const current = await imagesOf(ok.content.documentId);
    if (current.length + files.length > maxCount()) return fail(ctx, 400, 'TOO_MANY_IMAGES', `A post can have up to ${maxCount()} images.`);
    if (checkFiles(ctx, files) !== true) return;
    await guarded(ctx, async () => {
      const uploaded = inPickedOrder(ctx, files, await upload(files));
      ctx.body = { data: await setImages(ok.content.documentId, [...current.map((f) => f.id), ...uploaded.map((f) => f.id)], ctx.state.user.id) };
      await logImage(ctx, ok.content, 'content.image_added', [{ field: 'images', from: null, to: uploaded.map((f) => f.name) }]);
    });
  },

  async replace(ctx) {
    const ok = await requireContent(ctx, ctx.params.id, 'contentImage.replace');
    if (!ok) return;
    const current = await imagesOf(ok.content.documentId);
    const index = current.findIndex((f) => String(f.id) === String(ctx.params.imageId));
    if (index < 0) return fail(ctx, 404, 'NOT_FOUND', 'This image was already removed');
    const files = filesOf(ctx).slice(0, 1);
    if (checkFiles(ctx, files) !== true) return;
    await guarded(ctx, async () => {
      const [fresh] = await upload(files);
      const ids = current.map((f) => f.id);
      ids[index] = fresh.id; // same position as before
      ctx.body = { data: await setImages(ok.content.documentId, ids, ctx.state.user.id) };
      await logImage(ctx, ok.content, 'content.image_replaced', [{ field: 'images', from: current[index].name, to: fresh.name }]);
      await dropIfUnused(current[index].id);
    });
  },

  async remove(ctx) {
    const ok = await requireContent(ctx, ctx.params.id, 'contentImage.delete');
    if (!ok) return;
    const current = await imagesOf(ok.content.documentId);
    const target = current.find((f) => String(f.id) === String(ctx.params.imageId));
    if (!target) return fail(ctx, 404, 'NOT_FOUND', 'This image was already removed');
    await guarded(ctx, async () => {
      ctx.body = { data: await setImages(ok.content.documentId, current.filter((f) => f !== target).map((f) => f.id), ctx.state.user.id) };
      await logImage(ctx, ok.content, 'content.image_removed', [{ field: 'images', from: target.name, to: null }]);
      await dropIfUnused(target.id);
    });
  },

  async reorder(ctx) {
    const ok = await requireContent(ctx, ctx.params.id, 'contentImage.replace');
    if (!ok) return;
    const ids = ((ctx.request.body?.data ?? ctx.request.body)?.imageIds ?? []).map(String);
    const current = await imagesOf(ok.content.documentId);
    const same = ids.length === current.length && current.every((f) => ids.includes(String(f.id)));
    if (!same) return fail(ctx, 409, 'CONFLICT', 'The images changed in the meantime. Reload and try again.');
    ctx.body = { data: await setImages(ok.content.documentId, ids.map((id) => current.find((f) => String(f.id) === id).id), ctx.state.user.id) };
    await logImage(ctx, ok.content, 'content.images_reordered', [{ field: 'images', from: current.map((f) => f.name), to: ids.map((id) => current.find((f) => String(f.id) === id).name) }]);
  },

  async download(ctx) {
    const ok = await requireContent(ctx, ctx.params.id, 'contentImage.read');
    if (!ok) return;
    const file = (await imagesOf(ok.content.documentId)).find((f) => String(f.id) === String(ctx.params.imageId));
    if (!file) return fail(ctx, 404, 'NOT_FOUND', 'This image is no longer available');
    const name = String(file.name || 'image').replace(/[\r\n"\\]/g, '_');
    ctx.set('Content-Type', file.mime);
    ctx.set('Content-Disposition', `attachment; filename="${name.replace(/[^\x20-\x7e]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(name)}`);
    ctx.set('Cache-Control', 'private, no-store');
    if (/^https?:\/\//.test(file.url)) {
      // Object storage (S3/R2…): stream through so the browser gets a real download.
      const res = await fetch(file.url);
      if (!res.ok) return fail(ctx, 502, 'STORAGE', 'The image could not be read from storage');
      ctx.body = Buffer.from(await res.arrayBuffer());
      return;
    }
    // Local provider: resolve inside /public only (no path traversal).
    const root = path.resolve(strapi.dirs.static.public);
    const abs = path.resolve(root, `.${file.url}`);
    if (!abs.startsWith(root + path.sep) || !fs.existsSync(abs)) return fail(ctx, 404, 'NOT_FOUND', 'This image is no longer available');
    ctx.body = fs.createReadStream(abs);
  },
};
