// Windows NativeImage pixels are BGRA. Allow bounded GPU color-management rounding.
function inspectFrame(bitmap, width, height) {
  if (bitmap.length !== width * height * 4 || width <= 0 || height <= 0) throw new Error('Invalid frame dimensions.');
  let clear = 0, opaque = 0, body = 0;
  for (let i = 0; i < bitmap.length; i += 4) {
    if (bitmap[i + 3] === 0) clear++;
    if (bitmap[i + 3] === 255) opaque++;
    if (Math.abs(bitmap[i] - 214) <= 4 && Math.abs(bitmap[i + 1] - 177) <= 4 && Math.abs(bitmap[i + 2] - 191) <= 4 && bitmap[i + 3] === 255) body++;
  }
  const centerOffset = (Math.floor(height / 3) * width + Math.floor(width * 2 / 9)) * 4;
  const center = [...bitmap.subarray(centerOffset, centerOffset + 4)];
  return { width, height, clear, opaque, body, corner_bgra: [...bitmap.subarray(0, 4)], center_bgra: center,
    valid: clear / (width * height) > .8 && body / (width * height) > .04 && body / (width * height) < .08 && bitmap[3] === 0 && center[3] === 255 && Math.abs(center[0] - 214) <= 4 && Math.abs(center[1] - 177) <= 4 && Math.abs(center[2] - 191) <= 4 };
}
module.exports = { inspectFrame };
