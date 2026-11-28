'use strict';

/**
 * Turns an uploaded image into a square WebP ready to store:
 *  - cover:   cropped to fill (profile photos);
 *  - contain: whole image kept, transparent padding (logos).
 * Re-encoding drops EXIF (camera, GPS) and the original bytes.
 * Returns a formidable-like file object for the upload service; call cleanup() after.
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

async function squareWebp(file, { size = 400, fit = 'cover', name }) {
  const sharp = require('sharp');
  const out = path.join(os.tmpdir(), `${name.replace(/\W+/g, '-')}-${Date.now()}.webp`);
  const img = sharp(file.filepath, { animated: false }).rotate();
  if (fit === 'contain') await img.resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).webp({ quality: 90, alphaQuality: 100 }).toFile(out);
  else await img.resize(size, size, { fit: 'cover', position: 'attention' }).webp({ quality: 86 }).toFile(out);
  const prepared = { ...file, filepath: out, mimetype: 'image/webp', size: fs.statSync(out).size, originalFilename: `${name}.webp` };
  return { file: prepared, cleanup: () => fs.rmSync(out, { force: true }) };
}

/** Uploaded file → absolute URL (local uploads are served by Strapi at PUBLIC_URL). */
const absoluteUrl = (url) => (/^https?:\/\//.test(url) ? url : `${String(process.env.PUBLIC_URL || 'http://localhost:1337').replace(/\/$/, '')}${url}`);

module.exports = { squareWebp, absoluteUrl };
