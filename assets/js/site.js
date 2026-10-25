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
  const img = (theme, file) => `assets/img/themes/${theme}/${file}`;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  installSection();

  fetch("assets/data/themes.json")
    .then((response) => response.json())
    .then(start)
    .catch((error) => console.error("Couldn't load theme data", error));

  function start(data) {
    // Flagship themes first (in the hero's order), then the rest as the app lists them.
    const lead = data.heroThemes || [];
    const rank = (t) => (lead.includes(t.id) ? lead.indexOf(t.id) : lead.length);
    const themes = [...data.themes].sort((a, b) => rank(a) - rank(b));
    // Widget sizes per theme, in the order the app lists them.
    for (const theme of themes) theme.sizes = Object.fromEntries(theme.kinds.map((k) => [k.kind, { w: k.w, h: k.h }]));
    const byId = Object.fromEntries(themes.map((t) => [t.id, t]));
    const widgetInfo = Object.fromEntries(data.widgets.map((w) => [w.id, w]));
    if (data.version) $("#version").textContent = data.version;

    hero(themes, byId, data.heroThemes || themes.map((t) => t.id));
    gallery(themes);
    const playground = createPlayground(data, themes, byId, widgetInfo);
    widgetGallery(themes, widgetInfo);
    accentDemo(data.accentDemo);
    compareSlider();
    lightbox(byId, playground);
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
        name.textContent = theme.title;
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

  function gallery(themes) {
    const grid = $("#theme-grid");
    for (const theme of themes) {
      const card = el("button", { className: "theme-card", type: "button" }, [
        el("div", { className: "shot" }, [el("img", { src: img(theme.id, "preset-small.webp"), alt: "", loading: "lazy" })]),
        el("div", { className: "meta" }, [
          el("div", { className: "title" }, [
            el("span", { className: "dot", style: `background:${theme.accent};color:${theme.accent}` }),
            theme.title,
          ]),
          el("div", { className: "tagline", textContent: theme.tagline }),
        ]),
      ]);
      card.dataset.theme = theme.id;
      card.dataset.groups = ["all", theme.group, theme.light ? "light" : "dark"].join(" ");
      card.setAttribute("aria-label", `${theme.title}: ${theme.tagline}`);
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

  function lightbox(byId, playground) {
    const box = $("#lightbox");
    const close = () => { box.hidden = true; document.body.style.overflow = ""; };
    $("#theme-grid").addEventListener("click", (event) => {
      const card = event.target.closest(".theme-card");
      if (!card) return;
      const theme = byId[card.dataset.theme];
      $("#lightbox-image").src = img(theme.id, "preset.webp");
      $("#lightbox-image").alt = `The ${theme.title} theme on a Mac desktop`;
      $("#lightbox-title").textContent = theme.title;
      $("#lightbox-tagline").textContent = theme.tagline;
      $("#lightbox-try").onclick = () => { close(); playground.load(theme.id); };
      box.hidden = false;
      document.body.style.overflow = "hidden";
    });
    box.addEventListener("click", (event) => {
      if (event.target === box || event.target.closest(".lightbox-close")) close();
    });
    document.addEventListener("keydown", (event) => { if (event.key === "Escape" && !box.hidden) close(); });
  }

  // MARK: Playground: a desktop you can arrange

  function createPlayground(data, themes, byId, widgetInfo) {
    const stage = $("#pg-stage"), tray = $("#pg-tray"), select = $("#pg-theme"), pair = $("#pg-pair");
    const canvas = data.canvas;
    // Widget images carry transparent padding (for shadows and tilted paper) around the widget itself.
    const pad = data.pad || 0;
    let theme = null;
    let placed = new Map(); // kind -> {node, x, y, w, h} in canvas points

    for (const t of themes) select.append(el("option", { value: t.id, textContent: t.title }));
    select.addEventListener("change", () => load(select.value));
    $("#pg-reset").addEventListener("click", () => load(theme.id));
    pair.addEventListener("click", () => theme.partner && load(theme.partner));

    const tick = () => {
      $("#pg-clock").textContent = new Date().toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" });
    };
    tick();
    setInterval(tick, 30_000);

    const scale = () => stage.clientWidth / canvas.width;

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
            const size = theme.sizes[kind];
            place(kind, { x: (canvas.width - size.w) / 2, y: (canvas.height - size.h) / 2, w: size.w, h: size.h });
          }
          renderTray();
        });
        tray.append(chip);
      }
    }

    function load(id) {
      theme = byId[id] || themes[0];
      select.value = theme.id;
      for (const item of placed.values()) item.node.remove();
      placed = new Map();
      stage.style.backgroundImage = `url("${img(theme.id, "wallpaper.webp")}")`;
      for (const frame of theme.layout) place(frame.kind, frame);
      pair.hidden = !theme.partner;
      if (theme.partner) pair.textContent = `Switch to ${byId[theme.partner].light ? "light" : "dark"}`;
      renderTray();
    }

    new ResizeObserver(() => placed.forEach(position)).observe(stage);
    load(themes.find((t) => t.id === "glass") ? "glass" : themes[0].id);
    return { load };
  }

  // MARK: Widget gallery

  function widgetGallery(themes, widgetInfo) {
    const select = $("#wg-theme"), grid = $("#widget-grid");
    for (const t of themes) select.append(el("option", { value: t.id, textContent: t.title }));
    const render = (id) => {
      const theme = themes.find((t) => t.id === id);
      grid.replaceChildren();
      for (const [kind, size] of Object.entries(theme.sizes)) {
        const info = widgetInfo[kind] || { title: kind, blurb: "" };
        grid.append(el("article", { className: `widget-card${size.w > size.h * 1.5 ? " medium" : ""}` }, [
          el("div", { className: "stage", style: `background-image:url("${img(id, "wallpaper-small.webp")}")` }, [
            el("img", { src: img(id, `widgets/${kind}.webp`), alt: `${info.title} widget in ${theme.title}`, loading: "lazy" }),
          ]),
          el("div", { className: "meta" }, [el("b", { textContent: info.title }), el("span", { textContent: info.blurb })]),
        ]));
      }
    };
    select.addEventListener("change", () => render(select.value));
    select.value = themes.find((t) => t.id === "hifi") ? "hifi" : themes[0].id;
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
    for (const tab of document.querySelectorAll(".install-tabs .chip")) {
      tab.addEventListener("click", () => {
        for (const other of document.querySelectorAll(".install-tabs .chip")) {
          other.classList.toggle("active", other === tab);
          other.setAttribute("aria-selected", other === tab);
        }
        for (const panel of document.querySelectorAll(".install-panel")) panel.hidden = panel.dataset.panel !== tab.dataset.tab;
      });
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
