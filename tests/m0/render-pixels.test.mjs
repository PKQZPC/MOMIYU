import { test } from 'node:test';
import assert from 'node:assert/strict';
import pixels from '../../tools/m0/lib/render-pixels.cjs';
function fixture(scale, color = [214, 177, 191, 255], opaqueBackground = false) {
  const width = 360 * scale, height = 240 * scale, bitmap = Buffer.alloc(width * height * 4);
  if (opaqueBackground) bitmap.fill(255);
  for (let y = 40 * scale; y < 120 * scale; y++) for (let x = 40 * scale; x < 120 * scale; x++) {
    if ((x - 80 * scale) ** 2 + (y - 80 * scale) ** 2 <= (40 * scale) ** 2) bitmap.set(color, (y * width + x) * 4);
  }
  return pixels.inspectFrame(bitmap, width, height);
}
test('body and alpha are verified at 100% and 200% DPI', () => {
  assert.ok(fixture(1).valid); assert.ok(fixture(2).valid);
});
test('bounded GPU color conversion is allowed, wrong color is rejected', () => {
  assert.ok(fixture(2, [211,177,189,255]).valid);
  assert.equal(fixture(1, [0,0,255,255]).valid, false);
});
test('opaque blank frames and empty transparent frames cannot pass', () => {
  assert.equal(fixture(1, [214,177,191,255], true).valid, false);
  assert.equal(pixels.inspectFrame(Buffer.alloc(360*240*4),360,240).valid, false);
});
test('invalid bitmap size fails instead of silently accepting a partial buffer', () => {
  assert.throws(() => pixels.inspectFrame(Buffer.alloc(4),360,240));
});
