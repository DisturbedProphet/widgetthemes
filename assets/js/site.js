// WidgetThemes site: builds the theme gallery, widget gallery and feature
// demos from assets/data/themes.json, which the app writes with --export-site.
(() => {
  "use strict";

  const $ = (selector, root = document) => root.querySelector(selector);
  const el = (tag, props = {}, children = []) => {
    const node = Object.assign(document.createElement(tag), props);
    for (const child of children) node.append(child);
    return node;
  };
  const { img, autoVariant, desktopSystem, themePicker, systemDark, reduceMotion } = Playground;

  installSection();
  document.querySelectorAll(".mobile-sections a").forEach(link => link.addEventListener("click", () => { link.closest("details").open = false; }));

  fetch("assets/data/themes.json", { cache: "no-cache" })
    .then((response) => response.json())
    .then(start)
    .catch((error) => console.error("Couldn't load theme data", error));

  function start(data) {
    const catalog = Playground.catalog(data);
    const { themes, byId, widgetInfo, families, lights } = catalog;

    document.querySelectorAll('[data-theme-count]').forEach(n => n.textContent = lights.length);
    document.querySelectorAll('[data-pair-count]').forEach(n => n.textContent = Object.values(families).filter(f => f.dark).length);
    $('#paired-families').textContent = Object.values(families).filter(f => f.dark).map(f => f.title).join(', ');
    hero(themes, byId, data.heroThemes || themes.map((t) => t.id));
    gallery(lights, families);
    const playground = Playground.create(data, catalog);
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

  /** "windows" or "linux" for those desktops; null for a Mac or a phone. */
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
    themePicker(select, lights);
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
    const system = desktopSystem();
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
