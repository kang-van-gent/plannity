'use strict';

/**
 * Profile photos (Settings → Profile). One of:
 *  - upload   an image the person chose: cropped square, 400 px, re-encoded (strips
 *             EXIF such as GPS), stored with the upload provider;
 *  - gravatar the photo registered for their email at gravatar.com;
 *  - google   their Google account photo, captured when they sign in with Google;
 *  - none     initials.
 * user.avatarUrl always holds the absolute URL to show (or null).
 */
const crypto = require('node:crypto');
const { squareWebp, absoluteUrl } = require('../utils/square-image');

const USER = 'plugin::users-permissions.user';
const SIZE = 400;
const MAX_BYTES = 5 * 1024 * 1024;


/** Gravatar URL for an email (SHA-256, as Gravatar recommends). d=404 → no image when none is set. */
function gravatarUrl(email) {
  const hash = crypto.createHash('sha256').update(String(email || '').trim().toLowerCase()).digest('hex');
  return `https://gravatar.com/avatar/${hash}?s=${SIZE}&d=404`;
}

/** Does this email have a Gravatar photo? */
async function hasGravatar(email) {
  try {
    const res = await fetch(gravatarUrl(email), { method: 'HEAD', signal: AbortSignal.timeout(6000) });
    return res.ok;
  } catch {
    return null; // couldn't tell (network)
  }
}

async function removeUploaded(strapi, user) {
  const u = await strapi.db.query(USER).findOne({ where: { id: user.id }, populate: { avatar: true } });
  if (u?.avatar) {
    try { await strapi.plugin('upload').service('upload').remove(u.avatar); } catch (e) { strapi.log.warn(`[avatar] could not delete old photo ${u.avatar.id}: ${e.message}`); }
  }
}

/** Stores an uploaded photo (formidable file already type/size-checked) and makes it the profile photo. */
async function saveUpload(strapi, user, file) {
  const { file: prepared, cleanup } = await squareWebp(file, { size: SIZE, fit: 'cover', name: `avatar-${user.id}` });
  try {
    const [uploaded] = await strapi.plugin('upload').service('upload').upload({ data: { fileInfo: { name: `avatar-${user.id}.webp`, alternativeText: 'Profile photo' } }, files: prepared });
    await removeUploaded(strapi, user);
    return strapi.db.query(USER).update({ where: { id: user.id }, data: { avatar: uploaded.id, avatarSource: 'upload', avatarUrl: absoluteUrl(uploaded.url) } });
  } finally {
    cleanup();
  }
}

/** Switches to Gravatar / Google / none. Returns { user } or { error: code }. */
async function useSource(strapi, user, source) {
  const u = await strapi.db.query(USER).findOne({ where: { id: user.id } });
  if (source === 'gravatar') {
    const found = await hasGravatar(u.email);
    if (found === false) return { error: 'no_gravatar' };
    if (found === null) return { error: 'gravatar_unreachable' };
    await removeUploaded(strapi, user);
    return { user: await strapi.db.query(USER).update({ where: { id: user.id }, data: { avatar: null, avatarSource: 'gravatar', avatarUrl: gravatarUrl(u.email) } }) };
  }
  if (source === 'google') {
    if (!u.googleAvatarUrl) return { error: 'no_google_photo' };
    await removeUploaded(strapi, user);
    return { user: await strapi.db.query(USER).update({ where: { id: user.id }, data: { avatar: null, avatarSource: 'google', avatarUrl: u.googleAvatarUrl } }) };
  }
  if (source === 'none') {
    await removeUploaded(strapi, user);
    return { user: await strapi.db.query(USER).update({ where: { id: user.id }, data: { avatar: null, avatarSource: null, avatarUrl: null } }) };
  }
  return { error: 'invalid' };
}

/**
 * Remembers the Google account photo after a Google sign-in (the user row may be
 * created just after this runs, so it waits briefly for it). A person without a
 * photo yet gets it as their profile photo; a chosen photo is never replaced.
 */
function rememberGooglePhoto(strapi, email, picture) {
  if (!email || !/^https:\/\//.test(picture || '')) return;
  const url = String(picture).replace(/=s\d+-c$/, `=s${SIZE}-c`).slice(0, 500);
  let tries = 0;
  const attempt = async () => {
    const u = await strapi.db.query(USER).findOne({ where: { email: String(email).toLowerCase() } });
    if (!u) { if (++tries < 10) setTimeout(() => attempt().catch(() => {}), 500); return; }
    const data = { googleAvatarUrl: url };
    if (!u.avatarSource || u.avatarSource === 'google') Object.assign(data, { avatarSource: 'google', avatarUrl: url });
    await strapi.db.query(USER).update({ where: { id: u.id }, data });
  };
  attempt().catch((e) => strapi.log.warn(`[avatar] could not save the Google photo: ${e.message}`));
}

module.exports = { gravatarUrl, hasGravatar, saveUpload, useSource, rememberGooglePhoto, MAX_BYTES };
