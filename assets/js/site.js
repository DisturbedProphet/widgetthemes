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

    hero(themes, byId, data.heroThemes || themes.map((t) => t.id));
    gallery(lights, families);
    const playground = createPlayground(data, themes, byId, widgetInfo, lights);
    widgetGallery(byId, lights, families, widgetInfo);
    accentDemo(data.accentDemo);
    compareSlider();
    lightbox(byId, families, playground);
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

  function gallery(lights, families) {
    const grid = $("#theme-grid");
    for (const theme of lights) {
      const family = families[theme.family];
      const shot = el("img", { src: img(autoVariant(family), "preset-small.webp"), alt: "", loading: "lazy" });
      const card = el("button", { className: "theme-card", type: "button" }, [
        el("div", { className: "shot" }, [shot]),
        el("div", { className: "meta" }, [
          el("div", { className: "title" }, [
            el("span", { className: "dot", style: `background:${theme.accent};color:${theme.accent}` }),
            theme.familyTitle,
            ...(family.dark ? [el("span", { className: "modes", textContent: "Light & dark" })] : []),
          ]),
          el("div", { className: "tagline", textContent: theme.tagline }),
        ]),
      ]);
      if (family.dark) systemDark.addEventListener("change", () => { shot.src = img(autoVariant(family), "preset-small.webp"); });
      card.dataset.theme = family.id;
      card.dataset.groups = ["all", theme.group, theme.light ? "light" : "dark", ...(family.dark ? ["light", "dark"] : [])].join(" ");
      card.setAttribute("aria-label", `${theme.familyTitle}${family.dark ? ", light and dark" : ""}: ${theme.tagline}`);
      grid.append(card);
    }
    for (const chip of document.querySelectorAll(".chips .chip")) {
      chip.addEventListener("click", () => {
        for (const other of document.querySelectorAll(".chips .chip")) {
          other.classList.toggle("active", other === chip);
          other.setAttribute("aria-selected", other === chip);
        }
        for (const card of grid.children) {
          card.hidden = !card.dataset.groups.split(" ").includes(chip.dataset.filter);
        }
      });
    }
  }

  function lightbox(byId, families, playground) {
    const box = $("#lightbox"), modes = $("#lightbox-mode");
    const close = () => { box.hidden = true; document.body.style.overflow = ""; };
    let family = null, mode = "auto";
    const show = () => {
      const id = !family.dark ? family.light : mode === "auto" ? autoVariant(family) : family[mode];
      const theme = byId[id];
      $("#lightbox-image").src = img(id, "preset.webp");
      $("#lightbox-image").alt = `The ${family.title} theme${family.dark ? ` (${theme.light ? "light" : "dark"})` : ""} on a Mac desktop`;
      $("#lightbox-try").onclick = () => { close(); playground.load(id); };
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
      family = families[card.dataset.theme];
      mode = "auto";
      $("#lightbox-title").textContent = family.title;
      $("#lightbox-tagline").textContent = byId[family.light].tagline;
      modes.hidden = !family.dark;
      show();
      box.hidden = false;
      document.body.style.overflow = "hidden";
    });
    box.addEventListener("click", (event) => {
      if (event.target === box || event.target.closest(".lightbox-close")) close();
    });
    document.addEventListener("keydown", (event) => { if (event.key === "Escape" && !box.hidden) close(); });
  }

  // MARK: Playground: a desktop you can arrange

  function createPlayground(data, themes, byId, widgetInfo, lights) {
    const stage = $("#pg-stage"), tray = $("#pg-tray"), select = $("#pg-theme"), pair = $("#pg-pair");
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
      const partner = byId[select.value].partner;
      load(partner && systemDark.matches ? partner : select.value);
    });
    $("#pg-reset").addEventListener("click", () => load(theme.id));
    // Tidy up: every widget settles into a spot where nothing overlaps, edges lined up.
    $("#pg-tidy").addEventListener("click", () => {
      const items = [...placed.values()];
      const spots = Tidy.arrange(items, desk);
      glide(items.map((item, i) => ({ item, x: spots[i].x, y: spots[i].y })));
    });
    pair.addEventListener("click", () => theme.partner && load(theme.partner));

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
      const node = el("div", { className: "pg-widget" }, [
        el("img", { src: img(theme.id, `widgets/${kind}.webp`), alt: widgetInfo[kind]?.title || kind, draggable: false }),
      ]);
      const item = { node, kind, ...frame };
      placed.set(kind, item);
      stage.append(node);
      position(item);
      drag(item);
    }

    let topZ = 1;

    function drag(item) {
      item.node.addEventListener("pointerdown", (event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        // Raise with z-index: moving the node in the DOM would drop the pointer capture mid-drag.
        item.node.style.zIndex = String(++topZ);
        item.node.classList.add("dragging");
        const s = scale(), startX = event.clientX, startY = event.clientY, originX = item.x, originY = item.y;
        const move = (e) => {
          item.x = Math.min(Math.max(originX + (e.clientX - startX) / s, -item.w * 0.5), canvas.width - item.w * 0.5);
          item.y = Math.min(Math.max(originY + (e.clientY - startY) / s, 22), canvas.height - item.h * 0.5);
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
      tray.replaceChildren();
      for (const kind of Object.keys(theme.sizes)) {
        const on = placed.has(kind);
        const chip = el("button", { className: `chip${on ? "" : " off"}`, type: "button", textContent: `${on ? "−" : "+"} ${widgetInfo[kind]?.title || kind}` });
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
    }

    function load(id) {
      theme = byId[id] || themes[0];
      select.value = theme.light || !theme.partner ? theme.id : theme.partner;
      for (const item of placed.values()) item.node.remove();
      placed = new Map();
      stage.style.backgroundImage = `url("${img(theme.id, "wallpaper.webp")}")`;
      still.src = img(theme.id, "ornament.webp");
      still.hidden = false;
      live.hidden = true;
      drawing = false;
      sprites = Ornament.load(theme, (name) => img(theme.id, `sprites/${name}.webp`), scheduleRedraw);
      for (const frame of theme.layout) place(frame.kind, frame);
      pair.hidden = !theme.partner;
      if (theme.partner) pair.textContent = `Switch to ${byId[theme.partner].light ? "light" : "dark"}`;
      renderTray();
    }

    new ResizeObserver(() => {
      placed.forEach(position);
      scheduleRedraw();
    }).observe(stage);
    load(themes.find((t) => t.id === "glass") ? "glass" : themes[0].id);
    return { load };
  }

  // MARK: Widget gallery

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
            el("img", { src: img(id, `widgets/${kind}.webp`), alt: `${info.title} widget in ${theme.familyTitle}`, loading: "lazy" }),
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
