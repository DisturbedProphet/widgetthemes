// Finds tidy places for widgets: no overlaps, a steady gap between neighbours, and edges lined up.
// The same as Sources/WidgetThemes/App/Tidy.swift, on {x, y, w, h} rectangles with y running down the page.
window.Tidy = (() => {
  "use strict";

  /** Space between neighbouring widgets, and how close an edge must be to be pulled into line. */
  const GAP = 10, PULL = 14;

  const maxX = (r) => r.x + r.w, maxY = (r) => r.y + r.h;
  const midX = (r) => r.x + r.w / 2, midY = (r) => r.y + r.h / 2;
  const intersects = (a, b) => a.x < maxX(b) && b.x < maxX(a) && a.y < maxY(b) && b.y < maxY(a);

  function fits(rect, placed, bounds) {
    const e = 0.5, g = GAP - 0.5;
    if (rect.x < bounds.x - e || rect.y < bounds.y - e || maxX(rect) > maxX(bounds) + e || maxY(rect) > maxY(bounds) + e) return false;
    return !placed.some((p) => intersects({ x: p.x - g, y: p.y - g, w: p.w + 2 * g, h: p.h + 2 * g }, rect));
  }

  function clamped(rect, bounds) {
    return {
      ...rect,
      x: Math.min(Math.max(rect.x, bounds.x), Math.max(maxX(bounds) - rect.w, bounds.x)),
      y: Math.min(Math.max(rect.y, bounds.y), Math.max(maxY(bounds) - rect.h, bounds.y)),
    };
  }

  /** Pulls each edge into line with the nearest matching edge of a placed widget, if one is close. */
  function aligned(rect, placed) {
    const xs = [], ys = [];
    for (const o of placed) {
      xs.push(o.x, maxX(o) - rect.w, maxX(o) + GAP, o.x - GAP - rect.w);
      ys.push(o.y, maxY(o) - rect.h, maxY(o) + GAP, o.y - GAP - rect.h);
    }
    const nearest = (values, v) => values.reduce((best, c) => (best === null || Math.abs(c - v) < Math.abs(best - v) ? c : best), null);
    const x = nearest(xs, rect.x), y = nearest(ys, rect.y);
    return {
      ...rect,
      x: x !== null && Math.abs(x - rect.x) < PULL ? x : rect.x,
      y: y !== null && Math.abs(y - rect.y) < PULL ? y : rect.y,
    };
  }

  /** Where a widget of {w, h} fits among `placed`, as close as possible to centring on `target` {x, y}. */
  function place(size, target, placed, bounds) {
    const { w, h } = size;
    const distance = (r) => Math.hypot(midX(r) - target.x, midY(r) - target.y);
    const closest = (rects) => rects.reduce((best, r) => (best === null || distance(r) < distance(best) ? r : best), null);
    const wanted = aligned(clamped({ x: target.x - w / 2, y: target.y - h / 2, w, h }, bounds), placed);
    if (fits(wanted, placed, bounds)) return wanted;

    // Beside each placed widget, flush with one of its edges or centred on it.
    const candidates = [];
    for (const o of placed) {
      for (const y of [o.y, maxY(o) - h, midY(o) - h / 2]) {
        candidates.push({ x: maxX(o) + GAP, y, w, h }, { x: o.x - GAP - w, y, w, h });
      }
      for (const x of [o.x, maxX(o) - w, midX(o) - w / 2]) {
        candidates.push({ x, y: maxY(o) + GAP, w, h }, { x, y: o.y - GAP - h, w, h });
      }
    }
    const beside = closest(candidates.filter((r) => fits(r, placed, bounds)));
    if (beside) return beside;

    // A crowded desk: anywhere it fits, on a coarse grid.
    const found = [];
    for (let y = bounds.y; y + h <= maxY(bounds); y += 20) {
      for (let x = bounds.x; x + w <= maxX(bounds); x += 20) {
        const r = { x, y, w, h };
        if (fits(r, placed, bounds)) found.push(r);
      }
    }
    return closest(found) || wanted;
  }

  /**
   * The same rectangles rearranged so none overlap, each kept as close as it can be to where it was.
   * Widgets already clear of the others settle first, so only the crowded ones move far.
   */
  function arrange(frames, bounds) {
    if (!frames.length) return [];
    const cx = frames.reduce((s, f) => s + midX(f), 0) / frames.length;
    const cy = frames.reduce((s, f) => s + midY(f), 0) / frames.length;
    const g = GAP - 0.5;
    const crowded = frames.map((f, i) => frames.some((o, j) => j !== i && intersects({ x: o.x - g, y: o.y - g, w: o.w + 2 * g, h: o.h + 2 * g }, f)));
    const distance = (i) => Math.hypot(midX(frames[i]) - cx, midY(frames[i]) - cy);
    const order = frames.map((_, i) => i).sort((a, b) => (crowded[a] === crowded[b] ? distance(a) - distance(b) : crowded[a] ? 1 : -1));
    const result = frames.slice(), placed = [];
    for (const i of order) {
      const f = frames[i];
      const spot = place({ w: f.w, h: f.h }, { x: midX(f), y: midY(f) }, placed, bounds);
      result[i] = spot;
      placed.push(spot);
    }
    return result;
  }

  return { place, arrange };
})();
