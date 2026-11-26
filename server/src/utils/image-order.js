'use strict';

/** Sorts a post's images by its saved `imageOrder` (unknown ones last, oldest first). */
function orderImages(images, order) {
  const list = Array.isArray(images) ? [...images] : [];
  const pos = new Map((Array.isArray(order) ? order : []).map((id, i) => [String(id), i]));
  return list.sort((a, b) => (pos.get(String(a.id)) ?? 1e9) - (pos.get(String(b.id)) ?? 1e9) || Number(a.id) - Number(b.id));
}

module.exports = { orderImages };
