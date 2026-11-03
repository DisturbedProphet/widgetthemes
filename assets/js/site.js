// WidgetThemes site: builds the theme gallery, playground, widget gallery and feature
// demos from assets/data/themes.json, which the app writes with --export-site.
(() => {
  "use strict";

  const $ = (selector, root = document) => root.querySelector(selector);
  const el = (tag, props = {}, children = []) => {
    const node = Object.assign(document.createElement(tag), props);
    for (const child of children) node.append(child);
    return node;
  };
  // Image URLs carry the export's build stamp, so a re-export isn't hidden behind cached images.
  let build = "";
  const img = (theme, file) => `assets/img/themes/${theme}/${file}${build}`;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const systemDark = window.matchMedia("(prefers-color-scheme: dark)");

  installSection();
  document.querySelectorAll(".mobile-sections a").forEach(link => link.addEventListener("click", () => { link.closest("details").open = false; }));

  fetch("assets/data/themes.json")
    .then((response) => response.json())
    .then(start)
    .catch((error) => console.error("Couldn't load theme data", error));

  function start(data) {
    if (data.build) build = `?v=${data.build}`;
    // Flagship themes first (in the hero's order), then the rest as the app lists them.
    const lead = data.heroThemes || [];
    const rank = (t) => (lead.includes(t.id) ? lead.indexOf(t.id) : lead.length);
    const themes = [...data.themes].sort((a, b) => rank(a) - rank(b));
    // Widget sizes per theme, in the order the app lists them.
    for (const theme of themes) theme.sizes = Object.fromEntries(theme.kinds.map((k) => [k.kind, { w: k.w, h: k.h }]));
    const byId = Object.fromEntries(themes.map((t) => [t.id, t]));
    const widgetInfo = Object.fromEntries(data.widgets.map((w) => [w.id, w]));
    // A theme that comes in light and dark is one family; each variant knows its family and the other variant.
    const families = Object.fromEntries((data.families || themes.map((t) => ({ ...t, light: t.id }))).map((f) => [f.id, f]));
    for (const theme of themes) {
      const family = families[theme.family] || families[theme.id];
      theme.family = family.id;
      theme.familyTitle = family.title;
      theme.partner = family.dark ? (theme.id === family.light ? family.dark : family.light) : null;
    }
    // One entry per family, in the themes' order, standing for its light variant.
    const lights = themes.filter((t) => t.id === families[t.family].light);

    document.querySelectorAll('[data-theme-count]').forEach(n => n.textContent = lights.length);
    document.querySelectorAll('[data-pair-count]').forEach(n => n.textContent = Object.values(families).filter(f => f.dark).length);
    $('#paired-families').textContent = Object.values(families).filter(f => f.dark).map(f => f.title).join(', ');
    hero(themes, byId, data.heroThemes || themes.map((t) => t.id));
    gallery(lights, families);
    const playground = createPlayground(data, themes, byId, widgetInfo, lights);
    widgetGallery(byId, lights, families, widgetInfo);
    accentDemo(data.accentDemo);
    compareSlider();
    lightbox(byId, families, playground);
    alignToAddress();
  }

  // The browser jumps to the address's section before the gallery above it is built, so that
  // jump lands short. Go there properly now, and again if late fonts move things, unless the
  // visitor has already started scrolling or is returning to a place the browser remembers.
  function alignToAddress() {
    const target = document.getElementById(location.hash.slice(1));
    const arrival = performance.getEntriesByType("navigation")[0]?.type;
    if (!target || arrival === "reload" || arrival === "back_forward") return;
    let moved = false;
    const stop = () => { moved = true; };
    for (const type of ["wheel", "touchmove", "keydown", "mousedown"]) window.addEventListener(type, stop, { once: true, passive: true });
    const align = () => { if (!moved) target.scrollIntoView({ behavior: "instant" }); };
    align();
    document.fonts?.ready.then(align);
    if (document.readyState !== "complete") window.addEventListener("load", align, { once: true });
  }

  // MARK: Hero: a laptop that cross-fades between themes

  function hero(themes, byId, order) {
    const shot = $("#hero-shot"), next = $("#hero-shot-next");
    const name = $("#hero-theme"), tagline = $("#hero-tagline");
    let index = Math.max(order.indexOf("hifi"), 0);
    const show = (id) => {
      const theme = byId[id];
      if (!theme) return;
      next.src = img(id, "preset.webp");
      next.onload = () => {
        next.classList.add("show");
        setTimeout(() => {
          shot.src = next.src;
          shot.alt = `The ${theme.title} theme on a Mac desktop`;
          next.classList.remove("show");
        }, 950);
        name.textContent = theme.familyTitle;
        tagline.textContent = theme.tagline;
      };
    };
    if (reduceMotion) return;
    setInterval(() => {
      if (document.hidden) return;
      index = (index + 1) % order.length;
      show(order[index]);
    }, 4200);
  }

  // MARK: Theme gallery with filters

  // The variant a family shows in Auto: the one matching the visitor's system appearance.
  const autoVariant = (family) => (family.dark && systemDark.matches ? family.dark : family.light);

  const localThemes = {
    get(key) { try { const value = JSON.parse(localStorage.getItem('wt.' + key) || '[]'); return Array.isArray(value) ? value.filter(v => typeof v === 'string' && v.length < 50).slice(0,40) : []; } catch { return []; } },
    set(key, value) { try { localStorage.setItem('wt.' + key, JSON.stringify(value.slice(0,40))); } catch { /* Storage may be disabled. */ } },
  };
  function gallery(lights, families) {
    const grid = $('#theme-grid'), search = $('#theme-search'), more = $('#theme-show-all');
    const mobile = matchMedia('(max-width: 600px)');
    let filter = 'all', expanded = false;
    function render() {
      const favourites = localThemes.get('favourites'), recent = localThemes.get('recent');
      const query = search.value.trim().toLowerCase().slice(0,80);
      let matches = lights.filter(t => (filter === 'favourites' ? favourites.includes(t.family) : filter === 'recent' ? recent.includes(t.family) : filter === 'all' || t.group === filter || filter === 'light' && (t.light || families[t.family].dark)) && `${t.familyTitle} ${t.tagline} ${t.group}`.toLowerCase().includes(query));
      if (filter === 'recent') matches.sort((a,b)=>recent.indexOf(a.family)-recent.indexOf(b.family));
      const compact = mobile.matches && !expanded && filter === 'all' && !query;
      grid.replaceChildren();
      for (const theme of compact ? matches.slice(0,6) : matches) {
        const family = families[theme.family];
        const shot = el('img', {src:img(autoVariant(family),'preset-small.webp'),alt:'',loading:'lazy'});
        const card = el('button',{className:'theme-card',type:'button'},[
          el('div',{className:'shot'},[shot]),el('div',{className:'meta'},[
            el('div',{className:'title'},[theme.familyTitle,...(family.dark?[el('span',{className:'modes',textContent:'Light & dark'})]:[])]),
            el('div',{className:'tagline',textContent:theme.tagline}),
          ]),
        ]);
        card.dataset.theme = family.id;
        card.setAttribute('aria-label',`${theme.familyTitle}: ${theme.tagline}. Sample data preview`);
        const favourite = el('button',{className:'chip favourite',type:'button',textContent:favourites.includes(family.id)?'★ Favourite':'☆ Favourite'});
        favourite.setAttribute('aria-label',`Favourite ${family.title}`);
        favourite.setAttribute('aria-pressed',String(favourites.includes(family.id)));
        favourite.addEventListener('click',()=>{
          const ids = localThemes.get('favourites');
          localThemes.set('favourites',ids.includes(family.id)?ids.filter(id=>id!==family.id):[...ids,family.id]);
          render(); grid.querySelector(`[data-favourite="${family.id}"]`)?.focus();
        });
        favourite.dataset.favourite = family.id;
        grid.append(el('article',{className:'theme-entry'},[card,favourite]));
      }
      more.hidden = !compact || matches.length <= 6;
      more.textContent = `Show all ${lights.length} themes`;
      more.setAttribute('aria-expanded',String(expanded));
      $('#theme-results').textContent = `${matches.length} themes${compact ? ', showing the first 6' : ''}${matches.length ? '' : '. Try another search or category.'}`;
    }
    document.querySelectorAll('[data-filter]').forEach(chip=>chip.addEventListener('click',()=>{
      filter = chip.dataset.filter;
      document.querySelectorAll('[data-filter]').forEach(other=>{other.classList.toggle('active',other===chip);other.setAttribute('aria-pressed',String(other===chip));});
      render();
    }));
    const clear = el('button',{className:'chip',type:'button',textContent:'Clear history'});
    clear.addEventListener('click',()=>{localThemes.set('recent',[]);render();});
    more.after(clear);
    search.addEventListener('input',render);
    more.addEventListener('click',()=>{expanded=true;render();grid.querySelectorAll('.theme-card')[6]?.focus();});
    mobile.addEventListener('change',render);
    systemDark.addEventListener('change',render);
    document.addEventListener('theme-opened',()=>{if(filter==='recent')render();});
    render();
  }

  function lightbox(byId, families, playground) {
    const box = $("#lightbox"), modes = $("#lightbox-mode");
    let origin = null, inerted = [];
    const close = () => {
      box.hidden = true; document.body.style.overflow = '';
      inerted.forEach(([node, old])=>{node.inert=old;}); inerted=[];
      if (origin?.isConnected) origin.focus({preventScroll:true});
      else ($(`#theme-grid .theme-card[data-theme="${family?.id}"]`) || $('#theme-search')).focus({preventScroll:true});
    };
    let family = null, mode = "auto";
    const show = () => {
      const id = !family.dark ? family.light : mode === "auto" ? autoVariant(family) : family[mode];
      const theme = byId[id];
      $("#lightbox-image").src = img(id, "preset.webp");
      $("#lightbox-image").alt = `The ${family.title} theme${family.dark ? ` (${theme.light ? "light" : "dark"})` : ""} on a Mac desktop`;
      $('#lightbox-try').href = LayoutShare.query({theme:family.id,mode}) + '#playground';
      $('#lightbox-try').onclick = event => { event.preventDefault(); close(); playground.load(id,mode); history.replaceState(null,'',LayoutShare.query({theme:family.id,mode})+'#playground'); $('#pg-theme').focus({preventScroll:true}); $('#playground').scrollIntoView(); };
      $("#lightbox-page").href = `themes/${family.id}/${mode === "auto" ? "" : `?mode=${mode}`}`;
      for (const button of modes.querySelectorAll("button")) button.setAttribute("aria-pressed", String(button.dataset.mode === mode));
    };
    modes.addEventListener("click", (event) => {
      const button = event.target.closest("button");
      if (button) { mode = button.dataset.mode; show(); }
    });
    systemDark.addEventListener("change", () => { if (family && !box.hidden) show(); });
    $("#theme-grid").addEventListener("click", (event) => {
      const card = event.target.closest(".theme-card");
      if (!card) return;
      origin = card;
      family = families[card.dataset.theme];
      localThemes.set('recent',[family.id,...localThemes.get('recent').filter(id=>id!==family.id)]);
      document.dispatchEvent(new Event('theme-opened'));
      mode = "auto";
      $("#lightbox-title").textContent = family.title;
      $("#lightbox-tagline").textContent = byId[family.light].tagline + " · Sample data";
      modes.hidden = !family.dark;
      show();
      box.hidden = false;
      document.body.style.overflow = 'hidden';
      inerted = [...document.body.children].filter(node=>node!==box && node.tagName!=='SCRIPT').map(node=>[node,node.inert]);
      inerted.forEach(([node])=>{node.inert=true;});
      $('.lightbox-close',box).focus();
    });
    box.addEventListener("click", (event) => {
      if (event.target === box || event.target.closest(".lightbox-close")) close();
    });
    box.addEventListener('keydown',event=>{
      if(event.key!=='Tab')return;
      const controls=[...box.querySelectorAll('button,a[href]')].filter(node=>!node.closest('[hidden]'));
      const first=controls[0],last=controls.at(-1);
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
    });
    document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!box.hidden){event.preventDefault();close();}});
  }

  // MARK: Playground: a desktop you can arrange

  function createPlayground(data, themes, byId, widgetInfo, lights) {
    const stage = $("#pg-stage"), tray = $("#pg-tray"), select = $("#pg-theme"), appearance = $("#pg-mode");
    let mode = "auto";
    const canvas = data.canvas;
    // Widget images carry transparent padding (for shadows and tilted paper) around the widget itself.
    const pad = data.pad || 0;
    let theme = null;
    let placed = new Map(); // kind -> {node, x, y, w, h} in canvas points

    // The theme's decoration: the app's own render of it for the preset layout, until the layout
    // changes; then a live drawing (ornament.js) that follows the widgets around.
    const still = $("#pg-ornament"), live = $("#pg-live"), pen = live.getContext("2d");
    let drawing = false, frame = 0, sprites = {};

    function redraw() {
      frame = 0;
      if (!drawing) return;
      const ratio = window.devicePixelRatio || 1;
      const width = Math.round(stage.clientWidth * ratio), height = Math.round(stage.clientHeight * ratio);
      if (live.width !== width || live.height !== height) Object.assign(live, { width, height });
      const k = scale() * ratio;
      pen.setTransform(1, 0, 0, 1, 0, 0);
      pen.clearRect(0, 0, width, height);
      pen.setTransform(k, 0, 0, k, 0, 0);
      Ornament.draw(pen, k, theme, [...placed.values()], sprites);
    }
    const scheduleRedraw = () => { if (!frame) frame = requestAnimationFrame(redraw); };

    function layoutChanged() {
      if (!drawing) {
        drawing = true;
        still.hidden = true;
        live.hidden = false;
      }
      scheduleRedraw();
    }

    for (const t of lights) select.append(el("option", { value: t.id, textContent: t.familyTitle }));
    // Picking a family shows the variant matching the visitor's appearance; the pair button swaps it.
    select.addEventListener("change", () => {
      load(select.value, mode);
    });
    $("#pg-reset").addEventListener("click", () => load(theme.id, mode));
    // Tidy up: every widget settles into a spot where nothing overlaps, edges lined up.
    $("#pg-tidy").addEventListener("click", () => {
      const items = [...placed.values()];
      const spots = Tidy.arrange(items, desk);
      glide(items.map((item, i) => ({ item, x: spots[i].x, y: spots[i].y })));
    });
    appearance.addEventListener('change',()=>load(theme.id,appearance.value,state().items));
    systemDark.addEventListener('change',()=>{if(mode==='auto')load(theme.id,mode,state().items);});
    const state = () => ({v:1,theme:theme.family,mode,items:[...placed.values()].map(({kind,x,y,w,h})=>({kind,x:Math.round(Math.max(0,x)),y:Math.round(Math.max(0,y)),w,h}))});
    $('#pg-share').addEventListener('click',async()=>{
      const url = new URL(location.href); url.search=LayoutShare.query(state());url.hash='playground';
      history.replaceState(null,'',url);
      try {await navigator.clipboard.writeText(url.href);$('#pg-status').textContent='Layout link copied.';}
      catch {$('#pg-status').replaceChildren(el('a',{href:url.href,textContent:'Your layout link — copy from the address bar.'}));}
    });
    $('#pg-download').addEventListener('click',()=>{
      try {
        const file=LayoutShare.envelope(state(),data,theme.id,crypto.randomUUID());
        const url=URL.createObjectURL(new Blob([JSON.stringify(file,null,2)],{type:'application/json'}));
        const link=el('a',{href:url,download:`${theme.family}-layout.widgetthemes`});link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
        $('#pg-status').textContent='Layout downloaded. Open it in WidgetThemes to add it to My Themes.';
      } catch(error){$('#pg-status').textContent=error.message;}
    });
    const panel=$('.playground'), expand=$('#pg-expand');
    let previewInert=[];
    expand.addEventListener('click',()=>{
      const expanded=panel.classList.toggle('expanded');
      expand.setAttribute('aria-expanded',String(expanded));expand.textContent=expanded?'Close larger preview':'Larger preview';
      document.body.style.overflow=expanded?'hidden':'';
      if(expanded){
        panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');panel.setAttribute('aria-label','Larger desktop preview');
        for(let node=panel;node.parentElement;node=node.parentElement){
          for(const sibling of node.parentElement.children)if(sibling!==node){previewInert.push([sibling,sibling.inert]);sibling.inert=true;}
        }
      }else{
        previewInert.forEach(([node,old])=>{node.inert=old;});previewInert=[];
        panel.removeAttribute('role');panel.removeAttribute('aria-modal');panel.removeAttribute('aria-label');expand.focus();
      }
    });
    panel.addEventListener('keydown',event=>{
      if(event.key!=='Tab'||!panel.classList.contains('expanded'))return;
      const controls=[...panel.querySelectorAll('button,select,[tabindex="0"]')].filter(n=>!n.disabled&&!n.hidden);
      if(event.shiftKey&&document.activeElement===controls[0]){event.preventDefault();controls.at(-1).focus();}
      else if(!event.shiftKey&&document.activeElement===controls.at(-1)){event.preventDefault();controls[0].focus();}
    });
    document.addEventListener('keydown',event=>{if(event.key==='Escape'&&panel.classList.contains('expanded'))expand.click();});
    $('#pg-zoom').addEventListener('change',()=>{stage.style.width=`${Number($('#pg-zoom').value)*100}%`;});

    const tick = () => {
      $("#pg-clock").textContent = new Date().toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" });
    };
    tick();
    setInterval(tick, 30_000);

    const scale = () => stage.clientWidth / canvas.width;
    // Where widgets may settle: below the menu bar, clear of the edges.
    const desk = { x: 16, y: 40, w: canvas.width - 32, h: canvas.height - 56 };

    /** Floats widgets to new spots, redrawing the decoration as they go. */
    function glide(moves) {
      moves = moves.filter((m) => m.x !== m.item.x || m.y !== m.item.y);
      if (!moves.length) return;
      const from = moves.map((m) => ({ x: m.item.x, y: m.item.y }));
      const start = performance.now(), duration = reduceMotion ? 0 : 450;
      const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
      layoutChanged();
      const step = (now) => {
        const t = duration ? Math.min((now - start) / duration, 1) : 1, k = ease(t);
        moves.forEach((m, i) => {
          m.item.x = from[i].x + (m.x - from[i].x) * k;
          m.item.y = from[i].y + (m.y - from[i].y) * k;
          position(m.item);
        });
        redraw();
        if (t < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }

    function position(item) {
      const s = scale();
      const base = theme.sizes[item.kind];
      const p = pad * (item.w / base.w); // the padding grows with the widget's size
      Object.assign(item.node.style, {
        left: `${(item.x - p) * s}px`, top: `${(item.y - p) * s}px`,
        width: `${(item.w + 2 * p) * s}px`, height: `${(item.h + 2 * p) * s}px`,
      });
    }

    function place(kind, frame) {
      const node = el("div", { className: "pg-widget", tabIndex:0, role:"group" }, [
        el("img", { src: img(theme.id, `widgets/${kind}.webp`), alt: widgetInfo[kind]?.title || kind, draggable: false }),
      ]);
      const item = { node, kind, ...frame };
      node.setAttribute('aria-label',`${widgetInfo[kind]?.title || kind}, sample data. Use arrow keys to move.`);
      node.addEventListener('keydown',event=>{
        const delta={ArrowLeft:[-10,0],ArrowRight:[10,0],ArrowUp:[0,-10],ArrowDown:[0,10]}[event.key];
        if(!delta)return;event.preventDefault();
        item.x=Math.max(0,Math.min(canvas.width-item.w,item.x+delta[0]));
        item.y=Math.max(22,Math.min(canvas.height-item.h,item.y+delta[1]));position(item);layoutChanged();
      });
      placed.set(kind, item);
      stage.append(node);
      position(item);
      drag(item);
    }

    let topZ = 1;

    function drag(item) {
      item.node.addEventListener("pointerdown", (event) => {
        if (event.button !== 0 || matchMedia("(max-width: 600px)").matches) return;
        event.preventDefault();
        // Raise with z-index: moving the node in the DOM would drop the pointer capture mid-drag.
        item.node.style.zIndex = String(++topZ);
        item.node.classList.add("dragging");
        const s = scale(), startX = event.clientX, startY = event.clientY, originX = item.x, originY = item.y;
        const move = (e) => {
          item.x = Math.min(Math.max(originX + (e.clientX - startX) / s, 0), canvas.width - item.w);
          item.y = Math.min(Math.max(originY + (e.clientY - startY) / s, 22), canvas.height - item.h);
          position(item);
          layoutChanged();
        };
        const up = () => {
          item.node.classList.remove("dragging");
          window.removeEventListener("pointermove", move);
          window.removeEventListener("pointerup", up);
          window.removeEventListener("pointercancel", up);
        };
        // Listening on the window keeps the drag going even when the pointer outruns the widget.
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", up);
        window.addEventListener("pointercancel", up);
      });
    }

    function renderTray() {
      const focusedKind = tray.contains(document.activeElement) ? document.activeElement.dataset.kind : null;
      tray.replaceChildren();
      for (const kind of Object.keys(theme.sizes)) {
        const on = placed.has(kind);
        const chip = el("button", { className: `chip${on ? "" : " off"}`, type: "button", textContent: `${on ? "−" : "+"} ${widgetInfo[kind]?.title || kind}` });
        chip.dataset.kind = kind;
        chip.setAttribute("aria-pressed", on);
        chip.addEventListener("click", () => {
          if (placed.has(kind)) {
            placed.get(kind).node.remove();
            placed.delete(kind);
          } else {
            // A new widget appears in the middle, then floats beside the others where it fits.
            const size = theme.sizes[kind], others = [...placed.values()];
            const target = others.length
              ? { x: others.reduce((s, o) => s + o.x + o.w / 2, 0) / others.length, y: others.reduce((s, o) => s + o.y + o.h / 2, 0) / others.length }
              : { x: canvas.width / 2, y: canvas.height / 2 };
            place(kind, { x: (canvas.width - size.w) / 2, y: (canvas.height - size.h) / 2, w: size.w, h: size.h });
            const spot = Tidy.place(size, target, others, desk);
            glide([{ item: placed.get(kind), x: spot.x, y: spot.y }]);
          }
          renderTray();
          layoutChanged();
        });
        tray.append(chip);
      }
      if (focusedKind) tray.querySelector(`[data-kind="${focusedKind}"]`)?.focus({ preventScroll: true });
    }

    function load(id, requestedMode = 'auto', items = null) {
      mode = ['auto','light','dark'].includes(requestedMode)?requestedMode:'auto';
      const requested=byId[id]||themes[0], family=data.families.find(f=>f.id===requested.family);
      const selected=family.dark ? mode==='auto' ? autoVariant(family) : family[mode] : family.light;
      theme=byId[selected];
      appearance.value=mode;
      appearance.disabled=!family.dark;
      select.value = theme.light || !theme.partner ? theme.id : theme.partner;
      for (const item of placed.values()) item.node.remove();
      placed = new Map();
      stage.style.backgroundImage = `url("${img(theme.id, "wallpaper.webp")}")`;
      still.src = img(theme.id, "ornament.webp");
      still.hidden = false;
      live.hidden = true;
      drawing = false;
      sprites = Ornament.load(theme, (name) => img(theme.id, `sprites/${name}.webp`), scheduleRedraw);
      for (const frame of items || theme.layout) {
        const base=theme.sizes[frame.kind];
        // Paired variants may have different base shapes; keep the centre and scale.
        const opposite=theme.partner && byId[theme.partner].sizes[frame.kind];
        if(items && opposite && Math.abs(frame.w/base.w-frame.h/base.h)>0.02){
          const ratio=Math.min(350/170,frame.w/opposite.w);
          const w=Math.round(base.w*ratio),h=Math.round(base.h*ratio);
          place(frame.kind,{...frame,w,h,x:Math.max(0,Math.min(canvas.width-w,frame.x+(frame.w-w)/2)),y:Math.max(22,Math.min(canvas.height-h,frame.y+(frame.h-h)/2))});
        }else place(frame.kind,frame);
      }
      if(items) layoutChanged();
      renderTray();
    }

    new ResizeObserver(() => {
      placed.forEach(position);
      scheduleRedraw();
    }).observe(stage);
    const initial=LayoutShare.read(location.search,data);
    load(initial.theme,initial.mode,initial.items);
    return { load };
  }

  // MARK: Widget gallery

  // Widget images are drawn with this much space around them, for their shadows.
  const WIDGET_MARGIN = 48;

  function widgetGallery(byId, lights, families, widgetInfo) {
    const select = $("#wg-theme"), grid = $("#widget-grid");
    for (const t of lights) select.append(el("option", { value: t.id, textContent: t.familyTitle }));
    const render = (familyId) => {
      const id = autoVariant(families[byId[familyId].family]);
      const theme = byId[id];
      grid.replaceChildren();
      for (const [kind, size] of Object.entries(theme.sizes)) {
        const info = widgetInfo[kind] || { title: kind, blurb: "" };
        grid.append(el("article", { className: `widget-card${size.w > size.h * 1.5 ? " medium" : ""}` }, [
          el("div", { className: "stage", style: `background-image:url("${img(id, "wallpaper-small.webp")}")` }, [
            el("img", { src: img(id, `widgets/${kind}.webp`), alt: `${info.title} widget in ${theme.familyTitle}`, loading: "lazy", width: size.w + WIDGET_MARGIN, height: size.h + WIDGET_MARGIN }),
          ]),
          el("div", { className: "meta" }, [el("b", { textContent: info.title }), el("span", { textContent: info.blurb })]),
        ]));
      }
    };
    select.addEventListener("change", () => render(select.value));
    systemDark.addEventListener("change", () => render(select.value));
    select.value = byId.hifi ? "hifi" : lights[0].id;
    render(select.value);
  }

  // MARK: Download: Terminal command or disk image

  function installSection() {
    // The command points at wherever this page is published, so it's right on any host.
    const base = location.protocol.startsWith("http")
      ? location.origin + location.pathname.replace(/[^/]*$/, "")
      : "https://widgetthemes.example/";
    const command = `curl -fsSL ${base}install.sh | bash`;
    const code = $("#install-command"), copy = $("#copy-command");
    code.textContent = command;
    copy.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(command);
      } catch {
        const range = document.createRange();
        range.selectNodeContents(code);
        getSelection().removeAllRanges();
        getSelection().addRange(range);
        document.execCommand("copy");
      }
      copy.textContent = "Copied";
      copy.classList.add("done");
      setTimeout(() => { copy.textContent = "Copy"; copy.classList.remove("done"); }, 1800);
    });
    const tabs = [...document.querySelectorAll(".install-tabs .chip")];
    const show = (tab) => {
      for (const other of tabs) {
        other.classList.toggle("active", other === tab);
        other.setAttribute("aria-selected", other === tab);
      }
      for (const panel of document.querySelectorAll(".install-panel")) panel.hidden = panel.dataset.panel !== tab.dataset.tab;
    };
    for (const tab of tabs) tab.addEventListener("click", () => show(tab));
    // Visitors on Windows or Linux start on their own tab, and the hero button names their system.
    const platform = `${navigator.userAgentData?.platform || ""} ${navigator.platform || ""} ${navigator.userAgent}`;
    const system = /Win/i.test(platform) ? "windows" : /Linux|X11/i.test(platform) && !/Android/i.test(platform) ? "linux" : null;
    if (system) {
      show(tabs.find((tab) => tab.dataset.tab === system));
      $("#hero-download").textContent = `Download for ${system === "windows" ? "Windows" : "Linux"}`;
    }
  }

  // MARK: Feature demos

  function accentDemo(demo) {
    const row = $("#accent-swatches"), image = $("#accent-image");
    if (!demo) return;
    demo.variants.forEach((variant, index) => {
      const swatch = el("button", { className: `swatch${index === 0 ? " active" : ""}`, type: "button", title: variant.name });
      swatch.style.background = variant.color;
      swatch.setAttribute("aria-label", variant.name);
      swatch.addEventListener("click", () => {
        for (const other of row.children) other.classList.toggle("active", other === swatch);
        image.src = variant.file;
        image.alt = `The ${demo.title} widget in ${variant.name}`;
      });
      row.append(swatch);
      new Image().src = variant.file; // preload
    });
    image.src = demo.variants[0].file;
    image.alt = `The ${demo.title} widget in ${demo.variants[0].name}`;
  }

  function compareSlider() {
    const compare = $("#compare");
    const input = $("input", compare), top = $(".compare-top", compare), handle = $(".compare-handle", compare);
    const update = () => {
      top.style.clipPath = `inset(0 ${100 - input.value}% 0 0)`;
      handle.style.left = `${input.value}%`;
    };
    input.addEventListener("input", update);
    update();
  }
})();
