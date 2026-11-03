// Small, versioned public layout format. Only catalog IDs and geometry travel in URLs.
(function (root) {
  'use strict';
  const modes = ['auto', 'light', 'dark'];
  const clamp = (n, max) => Math.max(0, Math.min(n, max));
  function read(search, catalog) {
    const params = new URLSearchParams(search);
    const families = catalog.families;
    const requested = catalog.themes.find(t => t.id === params.get('theme'));
    const family = families.find(f => f.id === requested?.family || f.id === requested?.id) || families[0];
    const result = {v:1, theme:family.id, mode:modes.includes(params.get('mode')) ? params.get('mode') : 'auto'};
    const raw = params.get('layout');
    if (!raw || raw.length > 8000) return result;
    try {
      const value = JSON.parse(raw);
      const f = families.find(f => f.id === value.theme);
      if (value.v !== 1 || !f || !modes.includes(value.mode) || !Array.isArray(value.items) || value.items.length > 20) return result;
      const sizes = catalog.themes.filter(t => t.id === f.light || t.id === f.dark).flatMap(t => t.kinds);
      const seen = new Set();
      const valid = value.items.every(item => {
        const bases = sizes.filter(k => k.kind === item.kind);
        if (!bases.length || seen.has(item.kind) || !['x','y','w','h'].every(k => Number.isFinite(item[k]))) return false;
        seen.add(item.kind);
        return item.w >= 1 && item.h >= 1 && bases.some(base => item.w <= Math.round(base.w * (350/170)) && item.h <= Math.round(base.h * (350/170))
          && Math.abs(item.w / base.w - item.h / base.h) < 0.02)
          && item.x >= 0 && item.y >= 0 && item.x + item.w <= catalog.canvas.width && item.y + item.h <= catalog.canvas.height;
      });
      if (valid) return {v:1,theme:f.id,mode:value.mode,items:value.items.map(({kind,x,y,w,h})=>({kind,x,y,w,h}))};
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
    if (!clean.items?.length) throw new Error('Add a widget before downloading your layout.');
    const theme = catalog.themes.find(t => t.id === skin && t.family === clean.theme);
    if (!theme) throw new Error('Choose a valid theme.');
    const scales = [[0.75,'small'],[1,'medium'],[1.25,'large'],[1.5,'huge'],[350/170,'double']];
    const family = catalog.families.find(f => f.id === clean.theme);
    return {format:'WidgetThemes Theme',version:1,theme:{
      ...(id ? {id} : {}),name:`${family.title} browser layout`,created:now/1000-978307200,wallpaper:skin,
      widgets:clean.items.map(item => {
        const base = theme.kinds.find(k=>k.kind===item.kind);
        const ratio = item.w/base.w;
        const [scale,name] = scales.find(([s])=>s>=ratio-0.00001) || scales[scales.length-1];
        return {config:{kind:item.kind,skin,scale:name,fit:Math.min(1,ratio/scale),origin:[0,0],...(family.dark?{variant:clean.mode}:{})},
          fx:clamp(item.x / Math.max(1,catalog.canvas.width-item.w),1),
          fy:clamp(item.y / Math.max(1,catalog.canvas.height-item.h),1)};
      })}};
  }
  const api = {read,query,envelope};
  if (typeof module !== 'undefined') module.exports = api;
  else root.LayoutShare = api;
})(typeof window !== 'undefined' ? window : globalThis);
