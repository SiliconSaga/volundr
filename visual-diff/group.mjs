// Route-grouping key for "N pages with the identical change". Built from the
// pixels INSIDE the snapped change box on the before and after images — never
// from the published crops: those carry CROP_MARGIN of surrounding context
// that differs per page, so a shared-nav edit that is pixel-identical on
// every page still hashed 18 ways once each crop's margin caught that page's
// own heading (mtl-soccer#6 posted 18 full-width heroes for one change).
// Box coordinates are part of the key: "identical" means the same pixels
// changing the same way at the same place, which is exactly the shape a
// shared include produces.
import { createHash } from 'node:crypto';

export function regionKey(before, after, box) {
  const h = createHash('sha256');
  h.update(`${box.minX},${box.minY},${box.maxX},${box.maxY};`);
  for (const png of [before, after]) {
    for (let y = box.minY; y <= box.maxY; y++) {
      const start = (y * png.width + box.minX) * 4;
      const end = (y * png.width + box.maxX + 1) * 4;
      h.update(png.data.subarray(start, end));
    }
  }
  return h.digest('hex');
}
