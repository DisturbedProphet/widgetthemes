// Redraws a theme's scene ornament (the lines, rails and labels that tie its widgets together)
// around whatever layout the playground holds. A port of SceneOrnament from the app; colours and
// label images come from themes.json and assets/img/themes/<id>/sprites, written by --export-site.
window.Ornament = (() => {
  "use strict";

  // MARK: Geometry, on frames {x, y, w, h} in canvas points

  const maxX = (f) => f.x + f.w, maxY = (f) => f.y + f.h;
  const midX = (f) => f.x + f.w / 2, midY = (f) => f.y + f.h / 2;
  const center = (f) => ({ x: midX(f), y: midY(f) });
  const inset = (f, dx, dy) => ({ x: f.x + dx, y: f.y + dy, w: f.w - 2 * dx, h: f.h - 2 * dy });
  const dist = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);

  function union(frames) {
    const x = Math.min(...frames.map((f) => f.x)), y = Math.min(...frames.map((f) => f.y));
    return { x, y, w: Math.max(...frames.map(maxX)) - x, h: Math.max(...frames.map(maxY)) - y };
  }

  /** The clock if present, otherwise the (first) largest widget. */
  function hero(items) {
    const clock = items.find((i) => i.kind === "clock");
    if (clock) return clock;
    return items.reduce((best, i) => (i.w * i.h > best.w * best.h ? i : best));
  }

  /** Frames in reading order, snaking left-right then right-left, row by row. */
  function snake(items) {
    const rows = [];
    for (const f of [...items].sort((a, b) => midY(a) - midY(b))) {
      const row = rows[rows.length - 1];
      if (row && Math.abs(midY(row[0]) - midY(f)) < 110) row.push(f); else rows.push([f]);
    }
    return rows.flatMap((row, index) => {
      const ordered = [...row].sort((a, b) => midX(a) - midX(b));
      return index % 2 === 0 ? ordered : ordered.reverse();
    });
  }

  /** The control points of the Catmull-Rom curve through `points`, as cubic Béziers. */
  function segments(points) {
    const result = [];
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[Math.max(i - 1, 0)], p1 = points[i], p2 = points[i + 1], p3 = points[Math.min(i + 2, points.length - 1)];
      result.push([p1, { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 }, { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 }, p2]);
    }
    return result;
  }

  function smooth(ctx, points) {
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (const [, c1, c2, p] of segments(points)) ctx.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, p.x, p.y);
  }

  function polyline(ctx, points) {
    ctx.beginPath();
    points.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  }

  /** Points `spacing` apart along the smooth curve through `points`, with the curve's angle there. */
  function samples(points, spacing) {
    if (points.length < 2) return [];
    const dense = [];
    for (const [p1, c1, c2, p2] of segments(points)) {
      for (let step = 0; step < 24; step++) {
        const t = step / 24, u = 1 - t;
        dense.push({ x: u * u * u * p1.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * p2.x,
                     y: u * u * u * p1.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * p2.y });
      }
    }
    dense.push(points[points.length - 1]);
    const result = [];
    let carried = 0;
    for (let i = 1; i < dense.length; i++) {
      const a = dense[i - 1], b = dense[i], length = dist(a, b);
      if (length <= 0) continue;
      const angle = Math.atan2(b.y - a.y, b.x - a.x);
      let offset = spacing - carried;
      while (offset <= length) {
        const t = offset / length;
        result.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, angle });
        offset += spacing;
      }
      carried = length - (offset - spacing);
    }
    return result;
  }

  /** Where a ray from `rect`'s centre towards `target` leaves the rect, pushed out by `gap`. */
  function edge(rect, target, gap) {
    const dx = target.x - midX(rect), dy = target.y - midY(rect);
    const d = Math.max(Math.hypot(dx, dy), 1), ux = dx / d, uy = dy / d;
    const reach = Math.min(Math.abs(rect.w / 2 / Math.max(Math.abs(ux), 0.001)), Math.abs(rect.h / 2 / Math.max(Math.abs(uy), 0.001)));
    return { x: midX(rect) + ux * (reach + gap), y: midY(rect) + uy * (reach + gap) };
  }

  /** The app's SeededRandom (SplitMix64) with Swift's ranged-number and Bool algorithms, so scatter matches exactly. */
  function seeded(seed) {
    const M = (1n << 64n) - 1n;
    let state = BigInt(seed) & M;
    const next = () => {
      state = (state + 0x9E3779B97F4A7C15n) & M;
      let z = state;
      z = ((z ^ (z >> 30n)) * 0xBF58476D1CE4E5B9n) & M;
      z = ((z ^ (z >> 27n)) * 0x94D049BB133111EBn) & M;
      return z ^ (z >> 31n);
    };
    const below = (bound) => {
      let m = next() * bound;
      if ((m & M) < bound) {
        const t = ((1n << 64n) - bound) % bound;
        while ((m & M) < t) m = next() * bound;
      }
      return m >> 64n;
    };
    const top = 1n << 53n;
    return {
      number(lo, hi) { const r = below(top + 1n); return r === top ? hi : (hi - lo) * (Number(r) * 2 ** -53) + lo; },
      bool() { return ((next() >> 17n) & 1n) === 0n; },
    };
  }

  // MARK: Painting

  const rgba = (c, alpha = 1) => `rgba(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)},${(c[3] ?? 1) * alpha})`;
  const WHITE = [1, 1, 1, 1], BLACK = [0, 0, 0, 1];
  const canFilter = (() => { try { return typeof document.createElement("canvas").getContext("2d").filter === "string"; } catch { return false; } })();

  /** One painting pass: the canvas, its scale (device pixels per point) and the theme's colours and labels. */
  function painter(ctx, k, colors, sprites, images) {
    const p = {
      ctx, colors,
      /** Draws with SwiftUI's .blur(radius:) applied. */
      blurred(radius, color, draw) {
        ctx.save();
        if (canFilter) {
          ctx.filter = `blur(${radius * k * 0.5}px)`;
          draw();
        } else {
          // Without canvas filters, draw far off-canvas and let the shadow land in place.
          const far = 10000;
          ctx.shadowColor = color;
          ctx.shadowBlur = radius * k;
          ctx.shadowOffsetX = far * k;
          ctx.translate(-far, 0);
          draw();
        }
        ctx.restore();
      },
      /** Draws with SwiftUI's .shadow(color:radius:x:y:) applied (its radius is the blur's standard deviation). */
      shadowed(color, radius, draw, x = 0, y = 0) {
        ctx.save();
        ctx.shadowColor = color;
        ctx.shadowBlur = radius * 2 * k;
        ctx.shadowOffsetX = x * k;
        ctx.shadowOffsetY = y * k;
        draw();
        ctx.restore();
      },
      stroke(style, width, { cap = "butt", join = "miter", dash = [] } = {}) {
        ctx.strokeStyle = style;
        ctx.lineWidth = width;
        ctx.lineCap = cap;
        ctx.lineJoin = join;
        ctx.setLineDash(dash);
        ctx.stroke();
      },
      fill(style) { ctx.fillStyle = style; ctx.fill(); },
      rect(x, y, w, h, style) { ctx.fillStyle = style; ctx.fillRect(x, y, w, h); },
      line(a, b) { ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); },
      ellipse(x, y, w, h) { ctx.beginPath(); ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2); },
      roundRect(x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); },
      dot(point, radius, color, glow = 0) {
        const draw = () => { p.ellipse(point.x - radius, point.y - radius, radius * 2, radius * 2); p.fill(color); };
        glow > 0 ? p.shadowed(color, glow, draw) : draw();
      },
      linear(from, to, colors) {
        const gradient = ctx.createLinearGradient(from.x, from.y, to.x, to.y);
        colors.forEach((c, i) => gradient.addColorStop(colors.length > 1 ? i / (colors.length - 1) : 0, c));
        return gradient;
      },
      /** A label image, placed so its anchor point sits on (x, y). */
      sprite(name, x, y) {
        const info = sprites[name], image = images[name];
        if (info && image && image.complete && image.naturalWidth) ctx.drawImage(image, x - info.x, y - info.y, info.w, info.h);
      },
      /** Keeps further drawing off the widgets themselves (their panels are often translucent). */
      excludeWidgets(items, by, radius) {
        ctx.beginPath();
        ctx.rect(-1e4, -1e4, 2e4, 2e4);
        for (const item of items) {
          const f = inset(item, by, by), r = Math.min(radius, f.w / 2, f.h / 2);
          // Counter-clockwise, so the non-zero rule cuts each widget out of the big rectangle.
          ctx.moveTo(f.x + r, f.y);
          ctx.arcTo(f.x, f.y, f.x, f.y + r, r);
          ctx.arcTo(f.x, maxY(f), f.x + r, maxY(f), r);
          ctx.arcTo(maxX(f), maxY(f), maxX(f), maxY(f) - r, r);
          ctx.arcTo(maxX(f), f.y, maxX(f) - r, f.y, r);
          ctx.closePath();
        }
        ctx.clip();
      },
    };
    return p;
  }

  // MARK: Themes

  const themes = {
    paper(p, items) {
      const b = union(items), ink = p.colors.ink;
      p.sprite("masthead", midX(b), b.y - 104);
      const dateline = b.y - 44;
      p.rect(b.x, dateline - 6, b.w, 2, rgba(ink));
      p.sprite("issue", b.x, dateline + 2);
      p.sprite("date", midX(b), dateline + 2);
      p.sprite("edition", maxX(b), dateline + 2);
      p.rect(b.x, dateline + 20, b.w, 0.75, rgba(ink));
      for (const f of items) {
        if (f.x <= b.x + 10) continue;
        p.line({ x: f.x - 10, y: f.y + 6 }, { x: f.x - 10, y: maxY(f) - 6 });
        p.stroke(rgba(ink, 0.35), 0.75);
      }
      p.rect(b.x, maxY(b) + 12, b.w, 0.75, rgba(ink));
    },

    neon(p, items) {
      const points = snake(items).map(center), cyan = p.colors.cyan;
      if (points.length > 1) {
        const round = { cap: "round", join: "round" };
        p.blurred(6, rgba(cyan, 0.5), () => { smooth(p.ctx, points); p.stroke(rgba(cyan, 0.5), 6, round); });
        smooth(p.ctx, points);
        p.stroke(rgba(cyan), 2, round);
        p.stroke(rgba(WHITE, 0.7), 0.8, round);
      }
      const clock = items.find((i) => i.kind === "clock");
      if (clock) p.sprite("sign", midX(clock), maxY(clock) + 2);
    },

    bauhaus(p, items) {
      const b = union(items), h = hero(items), c = p.colors;
      const radius = h.h * 0.72;
      p.ellipse(midX(h) - radius, midY(h) - radius, radius * 2, radius * 2);
      p.fill(rgba(c.yellow));
      const rows = [];
      for (const f of [...items].sort((a, z) => midY(a) - midY(z))) {
        const row = rows[rows.length - 1];
        if (row && Math.abs(midY(row[0]) - midY(f)) < 110) row.push(f); else rows.push([f]);
      }
      for (const row of rows) {
        if (row.length < 2) continue;
        const y = row.reduce((sum, f) => sum + midY(f), 0) / row.length;
        const left = Math.min(...row.map((f) => f.x)), right = Math.max(...row.map(maxX));
        p.rect(left - 24, y - 4, right - left + 48, 8, rgba(c.ink));
      }
      p.rect(midX(h) - 4, b.y - 20, 8, b.h + 40, rgba(c.ink));
      p.ellipse(maxX(b) - 80, maxY(b) - 80, 160, 160);
      p.fill(rgba(c.red));
      p.rect(b.x - 26, b.y - 26, 90, 90, rgba(c.blue));
      const ctx = p.ctx;
      ctx.beginPath();
      ctx.moveTo(maxX(b) + 20, b.y - 20);
      ctx.lineTo(maxX(b) + 20, b.y + 80);
      ctx.lineTo(maxX(b) - 80, b.y - 20);
      ctx.closePath();
      p.fill(rgba(c.ink));
    },

    grove(p, items) {
      const points = snake(items).map(center), c = p.colors, ctx = p.ctx;
      if (points.length < 2) return;
      smooth(ctx, points);
      p.stroke(rgba(c.sage, 0.65), 1.6, { cap: "round" });
      const leaf = (x, y, w, h) => {
        ctx.beginPath();
        ctx.moveTo(x, y + h / 2);
        ctx.quadraticCurveTo(x + w / 2, y - h * 0.3, x + w, y + h / 2);
        ctx.quadraticCurveTo(x + w / 2, y + h * 1.3, x, y + h / 2);
        ctx.closePath();
      };
      samples(points, 26).forEach((s, index) => {
        const side = index % 2 === 0 ? 1 : -1, length = index % 3 === 0 ? 20 : 15;
        ctx.save();
        ctx.translate(s.x, s.y);
        ctx.rotate(s.angle + side * 0.9);
        leaf(0, -length * 0.2, length, length * 0.4);
        p.fill(index % 4 === 0 ? rgba(c.sage, 0.85) : rgba([0.36, 0.55, 0.40], 0.85));
        ctx.restore();
      });
      for (let i = 0; i < points.length - 1; i += 2) {
        const mid = { x: (points[i].x + points[i + 1].x) / 2, y: (points[i].y + points[i + 1].y) / 2 };
        for (let petal = 0; petal < 5; petal++) {
          ctx.save();
          ctx.translate(mid.x, mid.y);
          ctx.rotate((petal * 72 * Math.PI) / 180);
          leaf(0, -3.5, 11, 7);
          p.fill(rgba(c.terracotta));
          ctx.restore();
        }
        p.dot(mid, 2.5, rgba(c.gold));
      }
    },

    aero(p, items) {
      const points = snake(items).map(center), ctx = p.ctx, round = { cap: "round", join: "round" };
      if (points.length > 1) {
        p.blurred(10, rgba(WHITE, 0.28), () => { smooth(ctx, points); p.stroke(rgba(WHITE, 0.28), 46, round); });
        smooth(ctx, points);
        p.stroke(rgba(WHITE, 0.7), 1.5, round);
      }
      const random = seeded(42);
      for (const f of items) {
        for (let n = 0; n < 3; n++) {
          const r = random.number(5, 16);
          const x = random.bool() ? f.x - random.number(4, 26) : maxX(f) + random.number(4, 26);
          const y = random.number(f.y, maxY(f));
          const gradient = ctx.createRadialGradient(x, y, 0, x, y, r);
          gradient.addColorStop(0, rgba(WHITE, 0.05));
          gradient.addColorStop(1, rgba(WHITE, 0.28));
          p.ellipse(x - r, y - r, r * 2, r * 2);
          p.fill(gradient);
          p.stroke(rgba(WHITE, 0.75), 1);
          p.ellipse(x - r * 0.55, y - r * 0.65, r * 0.55, r * 0.35);
          p.fill(rgba(WHITE, 0.85));
        }
      }
    },

    classic(p, items) {
      const b = union(items);
      const bar = { x: b.x - 12, y: b.y - 44, w: b.w + 24, h: 22 };
      p.rect(bar.x, bar.y, bar.w, bar.h, "#fff");
      p.rect(bar.x, maxY(bar), bar.w, 1, "#000");
      p.sprite("menus", bar.x, midY(bar));
      p.sprite("time", maxX(bar) - 12, midY(bar));
      p.sprite("disk", maxX(b) + 46, b.y + 16);
      p.sprite("trash", maxX(b) + 46, maxY(b) - 40);
    },

    overdrive(p, items) {
      const h = hero(items), b = union(items), c = p.colors, ctx = p.ctx;
      for (const f of items) {
        if (f === h) continue;
        const corner = { x: midX(f), y: midY(h) };
        ctx.beginPath();
        ctx.moveTo(midX(h), midY(h));
        ctx.lineTo(corner.x, corner.y);
        ctx.lineTo(midX(f), midY(f));
        p.stroke(rgba(c.yellow, 0.32), 1.5);
        p.rect(corner.x - 3.5, corner.y - 3.5, 7, 7, rgba(c.yellow));
      }
      const band = { x: b.x, y: maxY(b) + 12, w: b.w, h: 10 };
      ctx.save();
      ctx.beginPath();
      ctx.rect(band.x, band.y, band.w, band.h);
      ctx.clip();
      p.rect(band.x, band.y, band.w, band.h, rgba(c.yellow));
      for (let x = band.x - band.h; x < maxX(band); x += 16) {
        ctx.beginPath();
        ctx.moveTo(x, maxY(band));
        ctx.lineTo(x + band.h, band.y);
        ctx.lineTo(x + band.h + 8, band.y);
        ctx.lineTo(x + 8, maxY(band));
        p.fill(rgba(c.black));
      }
      ctx.restore();
      p.sprite("status", b.x, b.y - 8);
      for (const m of [{ x: b.x - 14, y: b.y - 14 }, { x: maxX(b) + 14, y: b.y - 14 }, { x: b.x - 14, y: maxY(b) + 30 }, { x: maxX(b) + 14, y: maxY(b) + 30 }]) {
        p.line({ x: m.x - 8, y: m.y }, { x: m.x + 8, y: m.y });
        p.stroke(rgba(c.yellow), 1.5);
        p.line({ x: m.x, y: m.y - 8 }, { x: m.x, y: m.y + 8 });
        p.stroke(rgba(c.yellow), 1.5);
      }
    },

    hifi(p, items) {
      const frames = snake(items), ctx = p.ctx;
      const colors = [[0.75, 0.12, 0.10], [0.12, 0.12, 0.12], [0.92, 0.80, 0.40], [0.85, 0.85, 0.82]];
      for (let i = 0; i < frames.length - 1; i++) {
        const a = frames[i], z = frames[i + 1];
        const start = { x: midX(a) + (midX(z) > midX(a) ? a.w * 0.3 : -a.w * 0.3), y: maxY(a) - 12 };
        const end = { x: midX(z) + (midX(a) > midX(z) ? z.w * 0.3 : -z.w * 0.3), y: maxY(z) - 12 };
        const low = Math.max(start.y, end.y) + 34 + dist(start, end) * 0.12;
        ctx.beginPath();
        ctx.moveTo(start.x, start.y);
        ctx.bezierCurveTo(start.x, low, end.x, low, end.x, end.y);
        p.stroke(rgba(BLACK, 0.55), 6.5, { cap: "round" });
        p.stroke(rgba(colors[i % colors.length]), 4.5, { cap: "round" });
        p.stroke(rgba(WHITE, 0.25), 1, { cap: "round" });
      }
      const b = union(items);
      p.sprite("plate", midX(b), maxY(b) + 14);
    },

    groove(p, items) {
      const points = snake(items).map(center), c = p.colors, round = { cap: "round", join: "round" };
      if (points.length < 2) return;
      smooth(p.ctx, points);
      p.stroke(rgba(c.rust), 34, round);
      p.stroke(rgba(c.orange), 23, round);
      p.stroke(rgba(c.mustard), 12, round);
      p.stroke(rgba(c.cream), 3, round);
    },

    chalk(p, items) {
      const frames = snake(items), c = p.colors, ctx = p.ctx;
      const wobble = (start, end, seed, amount) => {
        const random = seeded(Math.abs(seed) + 1);
        const steps = Math.max(Math.trunc(dist(start, end) / 14), 2);
        const nx = -(end.y - start.y), ny = end.x - start.x, length = Math.max(Math.hypot(nx, ny), 1);
        ctx.beginPath();
        ctx.moveTo(start.x, start.y);
        for (let step = 1; step <= steps; step++) {
          const t = step / steps, jitter = step === steps ? 0 : random.number(-amount, amount);
          ctx.lineTo(start.x + (end.x - start.x) * t + (nx / length) * jitter, start.y + (end.y - start.y) * t + (ny / length) * jitter);
        }
      };
      for (let i = 0; i < frames.length - 1; i++) {
        const a = frames[i], z = frames[i + 1];
        const start = edge(a, center(z), 8), end = edge(z, center(a), 10);
        if (dist(start, end) <= 24) continue;
        const mid = { x: (start.x + end.x) / 2 - (end.y - start.y) * 0.18, y: (start.y + end.y) / 2 + (end.x - start.x) * 0.18 };
        const color = rgba([c.ink, c.yellow, c.pink, c.blue][i % 4], 0.8);
        ctx.beginPath();
        ctx.moveTo(start.x, start.y);
        ctx.quadraticCurveTo(mid.x, mid.y, end.x, end.y);
        p.stroke(color, 2, { cap: "round" });
        const angle = Math.atan2(end.y - mid.y, end.x - mid.x);
        for (const side of [-1, 1]) {
          const wing = { x: end.x - Math.cos(angle + side * 0.5) * 11, y: end.y - Math.sin(angle + side * 0.5) * 11 };
          wobble(end, wing, i * 2 + side + 1, 0.5);
          p.stroke(color, 2, { cap: "round" });
        }
      }
      const b = union(items), h = hero(items);
      p.sprite("heading", b.x + 4, b.y - 6);
      [{ x: -24, y: -10 }, { x: h.w + 18, y: 24 }, { x: h.w + 8, y: h.h - 8 }].forEach((o, index) => p.sprite(`doodle${index}`, h.x + o.x, h.y + o.y));
    },

    quest(p, items) {
      for (const s of samples(snake(items).map(center), 15)) {
        p.rect(s.x - 4.5, s.y - 4.5, 9, 9, rgba(BLACK, 0.7));
        p.rect(s.x - 3, s.y - 3, 6, 6, rgba([1, 0.93, 0.75]));
      }
      const b = union(items), h = hero(items);
      p.sprite("banner", midX(b), b.y - 6);
      p.sprite("hand", h.x - 16, midY(h));
    },

    cockpit(p, items) {
      const panel = inset(union(items), -26, -20);
      const grey = (white, alpha = 1) => rgba([white, white, white], alpha);
      p.shadowed(rgba(BLACK, 0.6), 20, () => {
        p.roundRect(panel.x, panel.y, panel.w, panel.h, 22);
        p.fill(p.linear({ x: 0, y: panel.y }, { x: 0, y: maxY(panel) }, [grey(0.13), grey(0.07)]));
      }, 0, 10);
      p.roundRect(panel.x, panel.y, panel.w, panel.h, 22);
      p.stroke(grey(0.3), 1.5);
      p.roundRect(panel.x - 10, panel.y - 12, panel.w + 20, 22, 11);
      p.fill(p.linear({ x: 0, y: panel.y - 12 }, { x: 0, y: panel.y + 10 }, [grey(0.16), grey(0.04)]));
      for (const s of [{ x: panel.x + 12, y: panel.y + 18 }, { x: maxX(panel) - 12, y: panel.y + 18 },
                       { x: panel.x + 12, y: maxY(panel) - 12 }, { x: maxX(panel) - 12, y: maxY(panel) - 12 }]) {
        p.ellipse(s.x - 4, s.y - 4, 8, 8);
        p.fill(grey(0.45));
        p.line({ x: s.x - 3, y: s.y }, { x: s.x + 3, y: s.y });
        p.stroke("#000", 1);
      }
      p.sprite("placard", midX(panel), maxY(panel) - 4);
    },

    apollo(p, items) {
      [...items].sort((a, z) => a.y - z.y || a.x - z.x).forEach((f, index) => p.sprite(`plate${index % 14}`, midX(f), f.y));
    },

    abyss(p, items) {
      p.excludeWidgets(items, 4, 12);
      const frames = snake(items), c = p.colors, ctx = p.ctx;
      for (let i = 0; i < frames.length - 1; i++) {
        const start = center(frames[i]), end = center(frames[i + 1]), mx = (start.x + end.x) / 2;
        ctx.beginPath();
        ctx.moveTo(start.x, start.y);
        ctx.lineTo(mx, start.y);
        ctx.lineTo(mx, end.y);
        ctx.lineTo(end.x, end.y);
        p.stroke(rgba([0.25, 0.16, 0.06]), 11, { join: "round" });
        p.stroke(rgba(c.brass), 8, { join: "round" });
        p.stroke(rgba([1, 0.9, 0.65], 0.6), 2, { join: "round" });
        for (const joint of [{ x: mx, y: start.y }, { x: mx, y: end.y }]) {
          p.roundRect(joint.x - 9, joint.y - 9, 18, 18, 3);
          p.fill(rgba(c.brassDark));
          p.roundRect(joint.x - 7, joint.y - 7, 14, 14, 3);
          p.fill(rgba(c.brass));
        }
      }
    },

    atlas(p, items) {
      p.excludeWidgets(items, 4, 12);
      const points = snake(items).map(center), c = p.colors, ctx = p.ctx;
      if (points.length < 2) return;
      smooth(ctx, points);
      p.stroke(rgba(c.route, 0.9), 2.2, { cap: "round", dash: [7, 5] });
      samples(points, 140).forEach((s, index) => {
        if (index % 2) return;
        p.line(s, { x: s.x, y: s.y - 16 });
        p.stroke(rgba(c.ink), 1.2);
        ctx.beginPath();
        ctx.moveTo(s.x, s.y - 16);
        ctx.lineTo(s.x + 10, s.y - 12);
        ctx.lineTo(s.x, s.y - 8);
        ctx.closePath();
        p.fill(rgba(c.route));
      });
    },

    kyoto(p, items) {
      const b = union(items);
      p.sprite("seal", maxX(b) + 14, maxY(b) - 44);
      p.sprite("column", maxX(b) + 14, b.y);
    },

    cork(p, items) {
      const frames = snake(items), ctx = p.ctx;
      for (let i = 0; i < frames.length - 1; i++) {
        const a = { x: midX(frames[i]), y: frames[i].y + 10 }, z = { x: midX(frames[i + 1]), y: frames[i + 1].y + 10 };
        p.shadowed(rgba(BLACK, 0.4), 1.5, () => {
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.quadraticCurveTo((a.x + z.x) / 2, Math.max(a.y, z.y) + 24, z.x, z.y);
          p.stroke(rgba(p.colors.red), 1.6);
        }, 1, 2);
      }
    },

    polar(p, items) {
      p.excludeWidgets(items, 4, 12);
      const points = snake(items).map(center);
      if (points.length < 2) return;
      polyline(p.ctx, points);
      p.stroke(rgba(WHITE, 0.22), 0.8);
      for (const f of items) {
        for (const corner of [{ x: f.x + 2, y: f.y + 2 }, { x: maxX(f) - 2, y: maxY(f) - 2 }]) p.dot(corner, 1.8, "#fff", 5);
      }
      samples(points, 90).forEach((s, index) => index % 2 === 1 && p.dot(s, 1.4, rgba([0.6, 1, 0.85]), 4));
    },

    mono(p, items) {
      const b = union(items), y = maxY(b) + 16;
      p.rect(b.x, y, b.w, 1, rgba(WHITE, 0.6));
      p.sprite("date", b.x, y + 8);
      p.ellipse(maxX(b) - 6, y + 9, 6, 6);
      p.fill(rgba([1, 0.26, 0.2]));
    },

    field(p, items, theme) {
      const orange = theme === "fieldDark" ? rgba([1, 0.42, 0.12]) : rgba([1, 0.36, 0.08]);
      for (const f of items) {
        for (const c of [{ x: f.x, y: f.y }, { x: maxX(f), y: maxY(f) }]) {
          p.line({ x: c.x - 7, y: c.y }, { x: c.x + 7, y: c.y });
          p.stroke(orange, 1.2);
          p.line({ x: c.x, y: c.y - 7 }, { x: c.x, y: c.y + 7 });
          p.stroke(orange, 1.2);
        }
      }
    },

    // Night themes: light that links the panels.

    obsidian(p, items) {
      const points = snake(items).map(center), b = union(items), c = p.colors;
      if (points.length < 2) return;
      const shading = p.linear({ x: b.x, y: b.y }, { x: maxX(b), y: maxY(b) }, c.gradient.map((g) => rgba(g)));
      p.blurred(3, rgba(c.gradient[1]), () => { smooth(p.ctx, points); p.stroke(shading, 2.5); });
      smooth(p.ctx, points);
      p.stroke(shading, 0.9);
      samples(points, 120).forEach((s, index) => index % 2 === 0 && p.dot(s, 2, "#fff", 6));
    },

    midnight(p, items) {
      const c = p.colors, ctx = p.ctx;
      const columns = [];
      for (const f of [...items].sort((a, z) => a.x - z.x)) {
        const column = columns[columns.length - 1];
        if (column && Math.abs(column[0].x - f.x) < 120) column.push(f); else columns.push([f]);
      }
      for (let index = 0; index < columns.length - 1; index++) {
        for (const source of columns[index]) {
          const target = columns[index + 1].reduce((best, f) => (Math.abs(f.y - source.y) < Math.abs(best.y - source.y) ? f : best));
          const start = { x: maxX(source) - 1, y: source.y + 19 }, end = { x: target.x + 1, y: target.y + 19 };
          const reach = Math.max((end.x - start.x) * 0.5, 30);
          const wire = () => {
            ctx.beginPath();
            ctx.moveTo(start.x, start.y);
            ctx.bezierCurveTo(start.x + reach, start.y, end.x - reach, end.y, end.x, end.y);
          };
          const shading = p.linear(start, end, [rgba(c.accent2), rgba(c.accent)]);
          p.blurred(4, rgba(c.accent2), () => { wire(); p.stroke(shading, 3.5); });
          wire();
          p.stroke(shading, 1.6, { cap: "round" });
        }
      }
    },

    pulse(p, items) {
      const circular = ["cpu", "memory", "disk", "battery", "downloads"];
      const rings = items.filter((i) => circular.includes(i.kind)).sort((a, z) => midX(a) - midX(z));
      if (rings.length < 2) return;
      const c = p.colors, ctx = p.ctx, first = rings[0], last = rings[rings.length - 1];
      const trace = () => {
        ctx.beginPath();
        ctx.moveTo(first.x - 70, midY(first));
        rings.forEach((ring, index) => {
          ctx.lineTo(midX(ring), midY(ring));
          const next = rings[index + 1];
          if (!next) return;
          const m = { x: (maxX(ring) + next.x) / 2, y: (midY(ring) + midY(next)) / 2 };
          for (const [dx, dy] of [[-12, 0], [-7, -6], [-3, 4], [1, -24], [6, 15], [11, 0]]) ctx.lineTo(m.x + dx, m.y + dy);
        });
        ctx.lineTo(maxX(last) + 70, midY(last));
      };
      const shading = p.linear({ x: first.x, y: 0 }, { x: maxX(last), y: 0 }, [rgba(c.accent), rgba(c.accent2), rgba(c.accent3)]);
      p.blurred(4, rgba(c.accent2), () => { trace(); p.stroke(shading, 4); });
      trace();
      p.stroke(shading, 1.8, { cap: "round", join: "round" });
    },

    prism(p, items) {
      const b = inset(union(items), -80, -60), c = p.colors;
      const start = { x: b.x, y: b.y + b.h * 0.15 }, end = { x: maxX(b), y: maxY(b) - b.h * 0.1 };
      p.blurred(26, rgba(c.gradient[1], 0.22), () => {
        p.line(start, end);
        p.stroke(p.linear(start, end, c.gradient.map((g) => rgba(g, 0.22))), 90);
      });
      [-14, -5, 4, 13].forEach((offset, index) => {
        const color = c.gradient[index];
        if (!color) return;
        p.shadowed(rgba(color), 4, () => {
          p.line({ x: start.x, y: start.y + offset }, { x: end.x, y: end.y + offset * 2.4 });
          p.stroke(rgba(color, 0.7), 1);
        });
      });
    },

    carbon(p, items) {
      const b = union(items), c = p.colors, ctx = p.ctx;
      const clock = items.find((i) => i.kind === "clock") || b;
      const cx = midX(clock), cy = midY(clock) + 30, radius = clock.w * 0.62;
      const from = 200, to = 340, rad = (d) => (d * Math.PI) / 180;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, rad(from), rad(to));
      p.stroke(rgba(WHITE, 0.25), 2);
      p.shadowed(rgba(c.accent), 5, () => {
        ctx.beginPath();
        ctx.arc(cx, cy, radius, rad(to - 25), rad(to));
        p.stroke(rgba(c.accent), 4);
      });
      for (let step = 0; step <= 28; step++) {
        const angle = rad(from + ((to - from) * step) / 28), major = step % 4 === 0;
        const inner = radius - (major ? 14 : 7);
        const hot = step / 28 > (to - 25 - from) / (to - from);
        p.line({ x: cx + Math.cos(angle) * inner, y: cy + Math.sin(angle) * inner }, { x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius });
        p.stroke(hot ? rgba(c.accent) : rgba(WHITE, major ? 0.6 : 0.3), major ? 2 : 1);
      }
      const railY = Math.max(...items.map(maxY)) + 12;
      p.rect(b.x, railY, b.w - 60, 2.5, rgba(c.accent));
      p.rect(b.x, railY + 5, b.w - 90, 1, rgba(WHITE, 0.45));
      for (let i = 0; i < 3; i++) {
        const x = maxX(b) - 46 + i * 14;
        ctx.beginPath();
        ctx.moveTo(x, railY - 4);
        ctx.lineTo(x + 7, railY + 2);
        ctx.lineTo(x, railY + 8);
        p.stroke(rgba(c.accent, 1 - i * 0.25), 2.5);
      }
    },

    velvet(p, items) {
      const b = union(items), railY = b.y - 46, gold = [0.92, 0.78, 0.5];
      p.rect(b.x - 30, railY - 3, b.w + 60, 6, p.linear({ x: 0, y: railY - 3 }, { x: 0, y: railY + 3 }, [rgba(gold, 0.95), rgba([0.55, 0.4, 0.2])]));
      for (const f of items.filter((i) => i.y < b.y + 70)) {
        const hook = { x: midX(f), y: railY + 3 };
        p.line(hook, { x: f.x + f.w * 0.22, y: f.y + 6 });
        p.stroke(rgba(gold, 0.7), 0.8);
        p.line(hook, { x: maxX(f) - f.w * 0.22, y: f.y + 6 });
        p.stroke(rgba(gold, 0.7), 0.8);
        p.ellipse(hook.x - 4, hook.y - 2, 8, 8);
        p.fill(rgba(gold));
      }
    },
  };
  themes.fieldDark = themes.field;

  /** Midnight's dot grid, under its cards. */
  function dotGrid(p, items) {
    const area = inset(union(items), -48, -40), ctx = p.ctx;
    ctx.beginPath();
    for (let y = area.y; y <= maxY(area); y += 24) {
      for (let x = area.x; x <= maxX(area); x += 24) {
        ctx.moveTo(x + 0.9, y);
        ctx.arc(x, y, 0.9, 0, Math.PI * 2);
      }
    }
    p.fill(rgba([0.6, 0.7, 1], 0.13));
  }

  const night = ["obsidian", "midnight", "pulse", "prism", "carbon", "velvet"];
  // Themes whose ornament stays off translucent panels, and by how much: [inset, corner radius].
  const clipped = { neon: [4, 14], grove: [4, 14], aero: [4, 14], classic: [4, 14], overdrive: [4, 14], hifi: [4, 14],
                    groove: [4, 14], chalk: [4, 14], quest: [4, 14] };

  /**
   * Paints `theme`'s ornament for `items` ({kind, x, y, w, h} in canvas points) onto `ctx`,
   * which is already scaled to points; `k` is device pixels per point.
   */
  function draw(ctx, k, theme, items, images) {
    const spec = theme.ornament || {}, paint = themes[theme.id];
    if (!paint || !items.length) return;
    const p = painter(ctx, k, spec.colors || {}, spec.sprites || {}, images);
    ctx.save();
    if (theme.id === "midnight") dotGrid(p, items);
    if (night.includes(theme.id)) p.excludeWidgets(items, 5, 16);
    else if (clipped[theme.id]) p.excludeWidgets(items, ...clipped[theme.id]);
    paint(p, items, theme.id);
    ctx.restore();
  }

  /** Starts loading a theme's label images; `onload` runs as each arrives. */
  function load(theme, url, onload) {
    const images = {};
    for (const name of Object.keys(theme.ornament?.sprites || {})) {
      const image = new Image();
      image.onload = onload;
      image.src = url(name);
      images[name] = image;
    }
    return images;
  }

  return { draw, load };
})();
