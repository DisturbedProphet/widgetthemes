// Previews an accent colour on a widget image already drawn in the theme's own accent: pixels near
// that hue move to the new one and everything else stays. The app redraws properly; this is close.
(function (root) {
  'use strict';
  function hsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
    if (!d) return [0, 0, l];
    const s = d / (1 - Math.abs(2 * l - 1));
    const h = max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return [h * 60, s, l];
  }
  function rgb(h, s, l) {
    const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
    const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
    return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
  }
  const parse = (hex) => hsl(parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16));
  const clamp = (v) => Math.min(1, Math.max(0, v));
  const ramp = (v, from, to) => clamp((v - from) / (to - from));

  /** A grey or near-black accent has no hue to find in the image, so it can't be previewed. */
  const previewable = (hex) => parse(hex)[1] >= 0.2;

  /** Recolours RGBA pixels in place. */
  function recolor(pixels, fromHex, toHex) {
    const [fromH, fromS, fromL] = parse(fromHex), [toH, toS, toL] = parse(toHex);
    for (let i = 0; i < pixels.length; i += 4) {
      if (!pixels[i + 3]) continue;
      const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2];
      const [h, s, l] = hsl(r, g, b);
      const distance = Math.min(Math.abs(h - fromH), 360 - Math.abs(h - fromH));
      const weight = (1 - ramp(distance, 10, 24)) * ramp(s, 0.12, 0.25);
      if (!weight) continue;
      const [nr, ng, nb] = rgb(toH, clamp(s * (toS / Math.max(fromS, 0.01))), clamp(l + (toL - fromL) * (1 - Math.abs(l - fromL))));
      pixels[i] = r + (nr - r) * weight;
      pixels[i + 1] = g + (ng - g) * weight;
      pixels[i + 2] = b + (nb - b) * weight;
    }
    return pixels;
  }
  const api = { recolor, previewable };
  if (typeof module !== 'undefined') module.exports = api;
  else root.AccentTint = api;
})(typeof window !== 'undefined' ? window : globalThis);
