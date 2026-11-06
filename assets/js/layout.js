// Small, versioned public layout format. Only catalog IDs and geometry travel in URLs.
(function (root) {
  'use strict';
  const modes = ['auto', 'light', 'dark'];
  const clamp = (n, max) => Math.max(0, Math.min(n, max));
  // A desk may hold any widget from any theme, repeats included, so it allows more than one of each.
  const MAX_ITEMS = 40;
  // Sizes as multiples of a widget's natural size. Below this, text gets too small to read.
  const MIN_RATIO = 0.6, MAX_RATIO = 350/170;
  /**
   * Where a corner drag lands: the size asked for, unless that's within 3% of a stop (the app's
   * sizes and the theme's own), where it sticks. `free` (Option/Alt) turns the sticking off.
   */
  function snapSize(wanted, stops, free = false) {
    const ratio = Math.min(MAX_RATIO, Math.max(MIN_RATIO, wanted));
    if (free) return ratio;
    let best = ratio, nearest = 0.03;
    for (const stop of stops) {
      const off = Math.abs(ratio - stop) / stop;
      if (off <= nearest && stop >= MIN_RATIO && stop <= MAX_RATIO) { best = stop; nearest = off; }
    }
    return best;
  }
  function read(search, catalog) {
    const params = new URLSearchParams(search);
    const families = catalog.families;
    const requested = catalog.themes.find(t => t.id === params.get('theme'));
    const family = families.find(f => f.id === requested?.family || f.id === requested?.id) || families[0];
    const result = {v:1, theme:family.id, mode:modes.includes(params.get('mode')) ? params.get('mode') : 'auto'};
    if (/^#[0-9a-f]{6}$/i.test(params.get('accent'))) result.accent = params.get('accent');
    const raw = params.get('layout');
    if (!raw || raw.length > 8000) return result;
    try {
      const value = JSON.parse(raw);
      const f = families.find(f => f.id === value.theme);
      if (value.v !== 1 || !f || !modes.includes(value.mode) || !Array.isArray(value.items) || value.items.length > MAX_ITEMS) return result;
      const sizes = catalog.themes.filter(t => t.id === f.light || t.id === f.dark).flatMap(t => t.kinds);
      const valid = value.items.every(item => {
        // A widget from another theme is sized by that theme.
        const own = item.skin === undefined ? null : catalog.themes.find(t => t.id === item.skin);
        if (item.skin !== undefined && !own) return false;
        if (item.ref !== undefined && (!Number.isInteger(item.ref) || item.ref < 0)) return false;
        const bases = (own ? own.kinds : sizes).filter(k => k.kind === item.kind);
        if (!bases.length || !['x','y','w','h'].every(k => Number.isFinite(item[k]))) return false;
        return item.w >= 1 && item.h >= 1 && bases.some(base => item.w <= Math.round(base.w * (350/170)) && item.h <= Math.round(base.h * (350/170))
          && Math.abs(item.w / base.w - item.h / base.h) < 0.02)
          && item.x >= 0 && item.y >= 0 && item.x + item.w <= catalog.canvas.width && item.y + item.h <= catalog.canvas.height;
      });
      if (valid) {
        const look = {};
        if (/^#[0-9a-f]{6}$/i.test(value.accent)) look.accent = value.accent;
        if (catalog.themes.some(t => t.id === value.wallpaper)) look.wallpaper = value.wallpaper;
        return {v:1,theme:f.id,mode:value.mode,...look,items:value.items.map(({kind,x,y,w,h,skin,ref})=>({kind,x,y,w,h,...(skin?{skin}:{}),...(ref!==undefined?{ref}:{})}))};
      }
    } catch { /* An invalid or future URL opens a safe stock theme. */ }
    return result;
  }
  function query(state) {
    const params = new URLSearchParams({theme:state.theme,mode:state.mode});
    if (state.items) params.set('layout', JSON.stringify(state));
    return '?' + params.toString();
  }
  function envelope(state, catalog, skin, id, now = Date.now()) {
    const clean = read(query(state), catalog);
    if (!clean.items?.length) throw new Error('Add a widget first.');
    const theme = catalog.themes.find(t => t.id === skin && t.family === clean.theme);
    if (!theme) throw new Error('Choose a valid theme.');
    const scales = [[0.75,'small'],[1,'medium'],[1.25,'large'],[1.5,'huge'],[350/170,'double']];
    const family = catalog.families.find(f => f.id === clean.theme);
    return {format:'WidgetThemes Theme',version:1,...(clean.accent ? {accents:{[skin]:clean.accent}} : {}),theme:{
      ...(id ? {id} : {}),name:`${family.title} browser layout`,created:now/1000-978307200,wallpaper:clean.wallpaper || skin,
      widgets:clean.items.map(item => {
        const own = item.skin ? catalog.themes.find(t => t.id === item.skin) : theme;
        const ownFamily = catalog.families.find(f => f.id === own.family);
        const base = own.kinds.find(k=>k.kind===item.kind);
        const ratio = item.w/base.w;
        // A point's rounding mustn't tip a widget into the next size up.
        const [scale,name] = scales.find(([s])=>s*base.w>=item.w-0.5001) || scales[scales.length-1];
        // A widget from another theme keeps the look it was given; the desk's own follow its appearance.
        const variant = own === theme ? clean.mode : own.id === ownFamily?.dark ? 'dark' : 'light';
        return {...(item.ref!==undefined?{ref:item.ref}:{}),config:{kind:item.kind,skin:own.id,scale:name,fit:Math.min(1,ratio/scale),origin:[0,0],...(ownFamily?.dark?{variant}:{})},
          fx:clamp(item.x / Math.max(1,catalog.canvas.width-item.w),1),
          fy:clamp(item.y / Math.max(1,catalog.canvas.height-item.h),1)};
      })}};
  }
  const api = {read,query,envelope,snapSize,MIN_RATIO,MAX_RATIO};
  if (typeof module !== 'undefined') module.exports = api;
  else root.LayoutShare = api;
})(typeof window !== 'undefined' ? window : globalThis);
