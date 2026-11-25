'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { sniffImageType } = require('../src/utils/image-type');

test('detects real image types from bytes', () => {
  assert.equal(sniffImageType(Buffer.from([0xff, 0xd8, 0xff, 0xe0])), 'image/jpeg');
  assert.equal(sniffImageType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0])), 'image/png');
  assert.equal(sniffImageType(Buffer.from('RIFF\0\0\0\0WEBPVP8 ', 'latin1')), 'image/webp');
  assert.equal(sniffImageType(Buffer.from('GIF89a', 'latin1')), 'image/gif');
});

test('rejects non-images even with an image-like name', () => {
  assert.equal(sniffImageType(Buffer.from('%PDF-1.7')), null);
  assert.equal(sniffImageType(Buffer.from('<svg xmlns=')), null); // SVG can carry scripts: not allowed
  assert.equal(sniffImageType(Buffer.from('MZ\x90\0', 'latin1')), null);
  assert.equal(sniffImageType(Buffer.alloc(0)), null);
});
