// The desktop you can arrange: the website's playground and the apps' Preview window both run this.
// Pages provide the markup; Playground.catalog prepares themes.json and Playground.create wires it up.
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
  const autoVariant = (family) => (family.dark && systemDark.matches ? family.dark : family.light);

  /** Sorts the export into what the pages use, with each variant knowing its family and the other variant. */
  function catalog(data) {
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
    return { themes, byId, widgetInfo, families, lights };
  }

  function desktopSystem() {
    const platform = `${navigator.userAgentData?.platform || ""} ${navigator.platform || ""} ${navigator.userAgent}`;
    return /Win/i.test(platform) ? "windows" : /Linux|X11/i.test(platform) && !/Android/i.test(platform) ? "linux" : null;
  }

  // MARK: Theme picker: each theme's own wordmark on its wallpaper, as in the app

  /** Stands in for a hidden theme <select>, which keeps the value. Returns a call to show a changed value. */
  function themePicker(select, lights) {
    const label = select.getAttribute("aria-label");
    const face = el("img", { className: "theme-pick-face", alt: "", width: 72, height: 30 });
    const button = el("button", { className: "theme-pick", type: "button" }, [face]);
    button.setAttribute("aria-haspopup", "listbox");
    button.setAttribute("aria-expanded", "false");
    const list = el("div", { className: "theme-pick-list", role: "listbox", hidden: true });
    list.setAttribute("aria-label", label);
    const box = el("div", { className: "theme-pick-box" }, [button, list]);
    select.after(box);

    const current = () => lights.find((t) => t.id === select.value) || lights[0];
    const options = lights.map((theme) => {
      const option = el("button", { className: "theme-pick-option", type: "button", role: "option", title: theme.tagline, tabIndex: -1 }, [
        el("img", { src: img(theme.id, "chip.webp"), alt: "", width: 144, height: 60, loading: "lazy" }),
      ]);
      option.dataset.theme = theme.id;
      option.setAttribute("aria-label", theme.familyTitle);
      option.addEventListener("click", () => {
        close(true);
        if (select.value === theme.id) return;
        select.value = theme.id;
        select.dispatchEvent(new Event("change"));
        sync();
      });
      return option;
    });
    list.append(...options);

    function sync() {
      const theme = current();
      face.src = img(theme.id, "chip.webp");
      button.setAttribute("aria-label", `${label}: ${theme.familyTitle}`);
      button.title = theme.familyTitle;
      for (const option of options) {
        const on = option.dataset.theme === theme.id;
        option.classList.toggle("active", on);
        option.setAttribute("aria-selected", on);
      }
    }
    const outside = (event) => { if (!box.contains(event.target)) close(false); };
    function open() {
      sync();
      list.hidden = false;
      button.setAttribute("aria-expanded", "true");
      document.addEventListener("pointerdown", outside);
      const active = options.find((option) => option.classList.contains("active"));
      active?.focus({ preventScroll: true });
      active?.scrollIntoView({ block: "nearest" });
    }
    function close(refocus) {
      list.hidden = true;
      button.setAttribute("aria-expanded", "false");
      document.removeEventListener("pointerdown", outside);
      if (refocus) button.focus({ preventScroll: true });
    }
    button.addEventListener("click", () => (list.hidden ? open() : close(true)));
    button.addEventListener("keydown", (event) => {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); open(); }
    });
    list.addEventListener("keydown", (event) => {
      if (event.key === "Escape" || event.key === "Tab") {
        // Escape shuts only the list, not a larger preview it may be sitting in.
        if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); }
        close(event.key === "Escape");
        return;
      }
      const columns = Math.max(1, Math.round(list.clientWidth / options[0].offsetWidth));
      const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -columns, ArrowDown: columns }[event.key];
      const at = options.indexOf(document.activeElement);
      let next = null;
      if (step) next = options[Math.max(0, Math.min(options.length - 1, at + step))];
      else if (event.key === "Home") next = options[0];
      else if (event.key === "End") next = options.at(-1);
      if (!next) return;
      event.preventDefault();
      next.focus({ preventScroll: true });
      next.scrollIntoView({ block: "nearest" });
    });
    sync();
    return sync;
  }

  // MARK: Playground: a desktop you can arrange

  function createPlayground(data, { themes, byId, widgetInfo, lights }, options = {}) {
    const { onChange } = options;
    const stage = $("#pg-stage"), tray = $("#pg-tray"), select = $("#pg-theme"), appearance = $("#pg-mode");
    const wrap = $(".pg-stage-wrap"), status = $("#pg-status"), tip = $("#pg-tip"), panel = $(".playground");
    let mode = "auto";
    // The website's desk is always this size. In the apps it's the display being arranged (`real`,
    // set by Editor/editor.js), so what's arranged is what lands on it.
    const canvas = data.canvas;
    const menuBar = canvas.top ?? 22;
    // Widget images carry transparent padding (for shadows and tilted paper) around the widget itself.
    const pad = data.pad || 0;
    // The sizes the app offers, as multiples of a widget's natural size.
    const SIZES = [[0.75, "75%"], [1, "100%"], [1.25, "125%"], [1.5, "150%"], [350 / 170, "2×"]];
    let theme = null;
    let placed = new Map(); // uid -> {node, uid, kind, skin?, ref?, x, y, w, h} in canvas points; later entries sit in front
    let selected = null; // the uid of the widget being worked on
    let nextUid = 0;
    let look = {}; // {accent, wallpaper, custom} when the visitor has chosen them; custom is a picture of their own
    /** The theme a widget draws in: its own if it was given one, otherwise the desk's. */
    const skinOf = (item) => (item.skin && byId[item.skin]) || theme;
    const baseOf = (item) => skinOf(item).sizes[item.kind];

    // The theme's decoration: the app's own render of it for the preset layout, until the layout
    // changes; then a live drawing (ornament.js) that follows the widgets around.
    const still = $("#pg-ornament"), live = $("#pg-live"), pen = live.getContext("2d");
    let drawing = false, frame = 0, sprites = {};

    function redraw() {
      frame = 0;
      if (!drawing && !canvas.real) return;
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

    // MARK: Messages

    let statusTimer = 0;
    /** A short message over the desk, with an Undo button or a link when one helps. */
    function say(text, { undoable = false, link = null, stay = false } = {}) {
      clearTimeout(statusTimer);
      status.replaceChildren();
      if (!text) return;
      status.append(el("span", { textContent: text }));
      if (undoable) {
        const button = el("button", { type: "button", textContent: "Undo" });
        button.addEventListener("click", undo);
        status.append(button);
      }
      if (link) status.append(el("a", link));
      if (!stay) statusTimer = setTimeout(() => status.replaceChildren(), 9000);
    }

    // MARK: Undo

    const history = PlaygroundHistory.create();
    const snapshot = () => JSON.stringify({ family: theme.family, mode, look, items: drawing ? state().items : null });
    const undoButton = $("#pg-undo"), redoButton = $("#pg-redo");
    let urlTimer = 0;

    function syncUndo() {
      undoButton.disabled = !history.canUndo;
      redoButton.disabled = !history.canRedo;
    }

    /** The address follows the desk, so a reload brings the same one back. */
    function syncAddress() {
      clearTimeout(urlTimer);
      urlTimer = setTimeout(() => {
        const url = new URL(location.href);
        url.search = LayoutShare.query(drawing ? state() : { theme: theme.family, mode });
        window.history.replaceState(window.history.state, "", url);
      }, 250);
    }
    

    /** Something the visitor did is finished: it becomes a step they can undo. */
    function commit() {
      const before = history.canUndo;
      history.push(snapshot());
      syncUndo();
      if (before !== history.canUndo || drawing) tip.hidden = true;
      syncAddress();
      onChange?.();
    }

    function restore(text) {
      if (!text) return;
      const saved = JSON.parse(text);
      say("");
      load(saved.family, saved.mode, saved.items, saved.look);
      syncUndo();
      syncAddress();
      onChange?.();
    }
    const undo = () => { finishGlide(); restore(history.undo()); };
    const redo = () => { finishGlide(); restore(history.redo()); };
    undoButton.addEventListener("click", undo);
    redoButton.addEventListener("click", redo);
    document.addEventListener("keydown", (event) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "z") return;
      if (event.target.closest?.("input, textarea")) return;
      const box = panel.getBoundingClientRect();
      if (!panel.contains(event.target) && (box.bottom < 0 || box.top > innerHeight)) return;
      event.preventDefault();
      event.shiftKey ? redo() : undo();
    });

    // MARK: Toolbar

    for (const t of lights) select.append(el("option", { value: t.id, textContent: t.familyTitle }));
    const showTheme = themePicker(select, lights);
    /** Replaces the desk with a theme's own layout; the one it replaces is an Undo away. */
    function usePreset(id, nextMode, message) {
      finishGlide();
      const hadLayout = drawing;
      load(id, nextMode);
      commit();
      if (hadLayout) say(message, { undoable: true });
    }
    // Picking a family shows the variant matching the visitor's appearance; the pair button swaps it.
    select.addEventListener("change", () => usePreset(select.value, mode, `Switched to ${byId[select.value].familyTitle}.`));
    $("#pg-reset").addEventListener("click", () => usePreset(theme.id, mode, "Layout reset."));
    // Tidy up: every widget settles into a spot where nothing overlaps, edges lined up.
    $("#pg-tidy").addEventListener("click", () => tidyAll(true));
    function tidyAll(speak) {
      const items = [...placed.values()];
      const spots = Tidy.arrange(items, desk);
      const moved = items.some((item, i) => spots[i].x !== item.x || spots[i].y !== item.y);
      glide(items.map((item, i) => ({ item, x: spots[i].x, y: spots[i].y })), () => { commit(); });
      if (!speak) return;
      if (!Tidy.clear(spots, desk)) say("These don't all fit on the desk. Make some smaller or remove a few.");
      else say(moved ? "Tidied." : "Already tidy: nothing overlaps.", { undoable: moved });
    }
    appearance.addEventListener("change", () => {
      // A wallpaper from this same theme switches with it, rather than staying on the variant it was.
      const family = data.families.find((f) => f.id === theme.family);
      let next = look;
      if (family && look.wallpaper && [family.light, family.dark].includes(look.wallpaper)) {
        const { wallpaper, ...rest } = look;
        next = rest;
      }
      load(theme.id, appearance.value, drawing ? state().items : null, next);
      commit();
    });
    systemDark.addEventListener("change", () => { if (mode === "auto") load(theme.id, mode, drawing ? state().items : null, look); });
    // A picture of the visitor's own stays out of links and files: it only exists on this computer.
    const state = () => {
      finishGlide();
      const { custom, ...shared } = look;
      return {
        v: 1, theme: theme.family, mode, ...shared,
        items: [...placed.values()].filter((item) => item !== carrying).map(({ kind, x, y, w, h, skin, ref, backdrop, border }) => ({
          kind, x: Math.round(Math.max(0, x)), y: Math.round(Math.max(0, y)), w, h,
          ...(skin ? { skin } : {}), ...(ref !== undefined ? { ref } : {}),
          ...(backdrop ? { backdrop } : {}), ...(border ? { border: true } : {}),
        })),
      };
    };
    $("#pg-share")?.addEventListener("click", async () => {
      const url = new URL(location.href); url.search = LayoutShare.query(state()); url.hash = "playground";
      window.history.replaceState(window.history.state, "", url);
      try { await navigator.clipboard.writeText(url.href); say("Layout link copied."); }
      catch { say("", {}); status.append(el("a", { href: url.href, textContent: "Your layout link: copy it from the address bar." })); }
    });
    $("#pg-download")?.addEventListener("click", () => {
      try {
        const file = LayoutShare.envelope(state(), data, theme.id, crypto.randomUUID());
        const url = URL.createObjectURL(new Blob([JSON.stringify(file, null, 2)], { type: "application/json" }));
        const link = el("a", { href: url, download: `${theme.family}-layout.widgetthemes` }); link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
        say("Layout downloaded. Open the file in WidgetThemes to add it to My Themes.", { link: { href: "#download", textContent: "Get the app" }, stay: true });
      } catch (error) { say(error.message, { stay: true }); }
    });
    const expand = $("#pg-expand");
    let previewInert = [];
    expand?.addEventListener("click", () => {
      const expanded = panel.classList.toggle("expanded");
      expand.setAttribute("aria-expanded", String(expanded)); expand.textContent = expanded ? "Close larger" : "Larger";
      document.body.style.overflow = expanded ? "hidden" : "";
      if (expanded) {
        panel.setAttribute("role", "dialog"); panel.setAttribute("aria-modal", "true"); panel.setAttribute("aria-label", "Larger desktop preview");
        for (let node = panel; node.parentElement; node = node.parentElement) {
          for (const sibling of node.parentElement.children) if (sibling !== node) { previewInert.push([sibling, sibling.inert]); sibling.inert = true; }
        }
      } else {
        previewInert.forEach(([node, old]) => { node.inert = old; }); previewInert = [];
        panel.removeAttribute("role"); panel.removeAttribute("aria-modal"); panel.removeAttribute("aria-label"); expand.focus();
      }
    });
    panel.addEventListener("keydown", (event) => {
      if (event.key !== "Tab" || !panel.classList.contains("expanded")) return;
      const controls = [...panel.querySelectorAll('button,select,input,[tabindex="0"]')].filter((n) => !n.disabled && !n.hidden && n.offsetParent);
      if (event.shiftKey && document.activeElement === controls[0]) { event.preventDefault(); controls.at(-1).focus(); }
      else if (!event.shiftKey && document.activeElement === controls.at(-1)) { event.preventDefault(); controls[0].focus(); }
    });
    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      if (panel.classList.contains("expanded")) expand?.click();
      else if (selected) choose(null);
    });
    $("#pg-zoom").addEventListener("change", () => { stage.style.width = `${Number($("#pg-zoom").value) * 100}%`; });

    // The widgets' readings are samples from when the site was built; the menu bar agrees with them.
    $("#pg-clock").textContent = `${new Date(data.build * 1000).toLocaleDateString([], { weekday: "short", timeZone: "UTC" })} 1:41 AM`;
    // Windows and Linux visitors shouldn't see a Mac's Finder menus.
    if (desktopSystem()) stage.querySelectorAll(".pg-menubar b, .pg-menubar span:not(.clock)").forEach((node) => node.remove());

    const scale = () => stage.clientWidth / canvas.width;
    // Where widgets may settle: below the menu bar, clear of the edges.
    const desk = { x: 16, y: menuBar + 18, w: canvas.width - 32, h: canvas.height - menuBar - 34 };

    let glideRun = 0, gliding = null;
    /** Puts widgets still floating at their destinations, so what's saved is where they're going. */
    function finishGlide() {
      if (!gliding) return;
      const { moves, done } = gliding;
      gliding = null;
      glideRun++;
      for (const m of moves) { m.item.x = m.x; m.item.y = m.y; position(m.item); }
      done?.();
    }
    /** Floats widgets to new spots, redrawing the decoration as they go. */
    function glide(moves, done) {
      finishGlide();
      moves = moves.filter((m) => m.x !== m.item.x || m.y !== m.item.y);
      if (!moves.length) { done?.(); return; }
      const run = ++glideRun;
      gliding = { moves, done };
      const from = moves.map((m) => ({ x: m.item.x, y: m.item.y }));
      const start = performance.now(), duration = reduceMotion ? 0 : 450;
      const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
      layoutChanged();
      const step = (now) => {
        if (run !== glideRun) return;
        const t = duration ? Math.min((now - start) / duration, 1) : 1, k = ease(t);
        moves.forEach((m, i) => {
          m.item.x = from[i].x + (m.x - from[i].x) * k;
          m.item.y = from[i].y + (m.y - from[i].y) * k;
          position(m.item);
        });
        redraw();
        if (t < 1) requestAnimationFrame(step);
        else { gliding = null; done?.(); }
      };
      requestAnimationFrame(step);
    }

    function position(item) {
      const s = scale();
      const base = baseOf(item);
      const p = pad * (item.w / base.w); // the padding grows with the widget's size
      Object.assign(item.node.style, {
        left: `${(item.x - p) * s}px`, top: `${(item.y - p) * s}px`,
        width: `${(item.w + 2 * p) * s}px`, height: `${(item.h + 2 * p) * s}px`,
      });
      item.node.style.setProperty("--p", `${p * s}px`);
      item.node.style.setProperty("--r", `${20 * (item.w / base.w) * s}px`);
    }

    /** Shows a widget's background and border the way the app draws them. */
    function dress(item) {
      item.node.classList.toggle("bd-dim", item.backdrop === "dim");
      item.node.classList.toggle("bd-glass", item.backdrop === "glass");
      item.node.classList.toggle("bd-border", Boolean(item.border));
    }

    /** Front to back follows the order widgets are listed in, which is the order a layout saves. */
    function restack() {
      let z = 1;
      // The selected widget comes forward while it's being worked on, so its handle can be reached.
      for (const item of placed.values()) item.node.style.zIndex = item.uid === selected ? "50" : String(z++);
    }

    function setLayer(uid, front) {
      const item = placed.get(uid), rest = [...placed].filter(([k]) => k !== uid);
      placed = new Map(front ? [...rest, [uid, item]] : [[uid, item], ...rest]);
      restack();
      scheduleRedraw();
    }

    const clampX = (item, x) => Math.min(Math.max(x, 0), canvas.width - item.w);
    const clampY = (item, y) => Math.min(Math.max(y, menuBar), canvas.height - item.h);

    function place(kind, frame) {
      const title = widgetInfo[kind]?.title || kind;
      const uid = `w${++nextUid}`;
      const handle = el("span", { className: "pg-handle" });
      const node = el("div", { className: "pg-widget", tabIndex: 0, role: "group" }, [
        el("span", { className: "pg-backdrop" }),
        el("img", { alt: title, draggable: false }),
        el("span", { className: "pg-edge" }),
        handle,
      ]);
      const item = { node, uid, kind, ...frame };
      dress(item);
      node.querySelector("img").src = widgetImage(item);
      node.setAttribute("aria-label", `${title}, sample data. Arrow keys move it, plus and minus resize it, Delete removes it.`);
      node.addEventListener("focus", () => choose(uid));
      node.addEventListener("keydown", (event) => keyed(event, item));
      placed.set(uid, item);
      stage.append(node);
      position(item);
      restack();
      drag(item);
      resize(item, handle);
      return item;
    }

    let keyTimer = 0;
    function keyed(event, item) {
      const step = event.shiftKey ? 1 : 10;
      const delta = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[event.key];
      if (delta) {
        event.preventDefault();
        item.x = clampX(item, item.x + delta[0]);
        item.y = clampY(item, item.y + delta[1]);
        position(item);
        layoutChanged();
        // A run of key presses is one step to undo.
        clearTimeout(keyTimer);
        keyTimer = setTimeout(commit, 400);
      } else if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        remove(item.uid);
      } else if (event.key === "+" || event.key === "=" || event.key === "-") {
        event.preventDefault();
        // The next of the app's sizes up or down, from wherever the widget is now.
        const now = item.w / baseOf(item).w, ratios = SIZES.map(([ratio]) => ratio);
        const next = event.key === "-" ? ratios.filter((r) => r < now - 0.005).at(-1) : ratios.find((r) => r > now + 0.005);
        if (next) { setSize(item, next); commit(); }
      }
    }

    // MARK: Moving a widget

    const guides = { x: $("#pg-guide-x"), y: $("#pg-guide-y") };
    function showGuides(lines) {
      const s = scale();
      guides.x.hidden = guides.y.hidden = true;
      for (const line of lines) {
        guides[line.axis].hidden = false;
        guides[line.axis].style[line.axis === "x" ? "left" : "top"] = `${line.at * s}px`;
      }
    }

    let dragging = false;
    // After a touch has held still, the finger moves the widget instead of scrolling the page.
    stage.addEventListener("touchmove", (event) => { if (dragging) event.preventDefault(); }, { passive: false });
    stage.addEventListener("contextmenu", (event) => { if (event.target.closest(".pg-widget") && matchMedia("(pointer: coarse)").matches) event.preventDefault(); });
    stage.addEventListener("pointerdown", (event) => { if (!event.target.closest(".pg-widget")) choose(null); });

    function drag(item) {
      item.node.addEventListener("pointerdown", (event) => {
        if (event.button !== 0 || event.target.classList.contains("pg-handle")) return;
        if (event.pointerType === "mouse") {
          event.preventDefault();
          item.node.focus({ preventScroll: true });
          begin(event);
          return;
        }
        // Touch: a tap selects, a hold picks up, and moving first is an ordinary scroll.
        const startX = event.clientX, startY = event.clientY;
        const hold = setTimeout(() => { stop(); item.node.focus({ preventScroll: true }); navigator.vibrate?.(10); begin(event); }, 250);
        const move = (e) => { if (Math.hypot(e.clientX - startX, e.clientY - startY) > 8) stop(); };
        const lift = () => { stop(); item.node.focus({ preventScroll: true }); };
        const stop = () => {
          clearTimeout(hold);
          window.removeEventListener("pointermove", move);
          window.removeEventListener("pointerup", lift);
          window.removeEventListener("pointercancel", stop);
        };
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", lift);
        window.addEventListener("pointercancel", stop);
      });

      function begin(event) {
        dragging = true;
        item.node.classList.add("dragging");
        const s = scale(), startX = event.clientX, startY = event.clientY, originX = item.x, originY = item.y;
        const startLeft = wrap.scrollLeft, startTop = wrap.scrollTop;
        let pointerX = startX, pointerY = startY, moved = false, free = false, edgeFrame = 0;
        const follow = () => {
          let x = clampX(item, originX + (pointerX - startX + wrap.scrollLeft - startLeft) / s);
          let y = clampY(item, originY + (pointerY - startY + wrap.scrollTop - startTop) / s);
          let lines = [];
          if (!free) {
            const others = [...placed.values()].filter((o) => o !== item);
            ({ x, y, lines } = Tidy.snap({ x, y, w: item.w, h: item.h }, desk, others));
          }
          item.x = x; item.y = y;
          position(item);
          showGuides(lines);
          layoutChanged();
        };
        // Zoomed in, holding a widget near the edge of the view scrolls the view.
        const edges = () => {
          const box = wrap.getBoundingClientRect(), margin = 36, speed = 12;
          const dx = pointerX < box.left + margin ? -speed : pointerX > box.right - margin ? speed : 0;
          const dy = pointerY < box.top + margin ? -speed : pointerY > box.bottom - margin ? speed : 0;
          const left = wrap.scrollLeft, top = wrap.scrollTop;
          wrap.scrollBy(dx, dy);
          if (wrap.scrollLeft !== left || wrap.scrollTop !== top) follow();
          edgeFrame = requestAnimationFrame(edges);
        };
        const move = (e) => {
          pointerX = e.clientX; pointerY = e.clientY; free = e.altKey;
          if (!moved && Math.hypot(pointerX - startX, pointerY - startY) > 2) {
            moved = true;
            // Raise with the listed order: moving the node in the DOM would drop the pointer capture mid-drag.
            setLayer(item.uid, true);
            tip.hidden = true;
          }
          if (moved) follow();
        };
        const up = () => {
          dragging = false;
          cancelAnimationFrame(edgeFrame);
          item.node.classList.remove("dragging");
          showGuides([]);
          window.removeEventListener("pointermove", move);
          window.removeEventListener("pointerup", up);
          window.removeEventListener("pointercancel", up);
          if (moved) commit();
        };
        // Listening on the window keeps the drag going even when the pointer outruns the widget.
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", up);
        window.addEventListener("pointercancel", up);
        edgeFrame = requestAnimationFrame(edges);
      }
    }

    // MARK: Sizes

    const sizeIndex = (item) => {
      const base = baseOf(item);
      return SIZES.findIndex(([ratio]) => Math.abs(Math.round(base.w * ratio) - item.w) <= 1);
    };

    /** The size a widget has in its theme's own layout on this desk, which needn't be one of the app's sizes. */
    function themeRatio(item) {
      const own = skinOf(item);
      const frame = ownLayout(own).find((f) => f.kind === item.kind);
      return frame ? frame.w / own.sizes[item.kind].w : 1;
    }
    const atThemeSize = (item) => Math.abs(Math.round(baseOf(item).w * themeRatio(item)) - item.w) <= 1;

    /** Resizes about the widget's centre, or from its top-left corner while a corner is being dragged, staying on the desktop. */
    function setSize(item, ratio, fromCorner = false) {
      const base = baseOf(item);
      const w = Math.round(base.w * ratio), h = Math.round(base.h * ratio);
      const midX = item.x + item.w / 2, midY = item.y + item.h / 2;
      Object.assign(item, { w, h });
      if (!fromCorner) {
        item.x = clampX(item, midX - w / 2);
        item.y = clampY(item, midY - h / 2);
      }
      position(item);
      layoutChanged();
      showInspector();
    }

    /** Dragging the corner scales smoothly, sticking at the app's sizes and the theme's own. Option/Alt doesn't stick. */
    function resize(item, handle) {
      handle.addEventListener("pointerdown", (event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        event.stopPropagation();
        dragging = true;
        const base = baseOf(item), before = item.w;
        const stops = [...SIZES.map(([ratio]) => ratio), themeRatio(item)];
        const desk = () => { const box = stage.getBoundingClientRect(), s = scale(); return (e) => [(e.clientX - box.left) / s, (e.clientY - box.top) / s]; };
        // Where on the handle it was picked up, so the corner doesn't jump to the pointer.
        const [startX, startY] = desk()(event);
        const graspX = startX - (item.x + item.w), graspY = startY - (item.y + item.h);
        const move = (e) => {
          const [x, y] = desk()(e);
          const wanted = Math.max((x - graspX - item.x) / base.w, (y - graspY - item.y) / base.h);
          // It can't grow past the desk's edge, since the opposite corner stays put.
          const room = Math.min((canvas.width - item.x) / base.w, (canvas.height - item.y) / base.h);
          const ratio = Math.min(LayoutShare.snapSize(wanted, stops, e.altKey), room);
          if (Math.round(base.w * ratio) !== item.w) setSize(item, ratio, true);
        };
        const up = () => {
          dragging = false;
          window.removeEventListener("pointermove", move);
          window.removeEventListener("pointerup", up);
          window.removeEventListener("pointercancel", up);
          if (item.w !== before) commit();
        };
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", up);
        window.addEventListener("pointercancel", up);
      });
    }

    // MARK: The selected widget

    const inspector = $("#pg-inspector"), sizeSelect = $("#pg-size"), sizeResetButton = $("#pg-size-reset"), widgetTheme = $("#pg-widget-theme");
    const backdropSelect = $("#pg-backdrop"), borderBox = $("#pg-border"), backdropAll = $("#pg-backdrop-all"), borderAll = $("#pg-border-all");
    function choose(uid) {
      if (selected === uid) return;
      placed.get(selected)?.node.classList.remove("selected");
      selected = uid;
      placed.get(uid)?.node.classList.add("selected");
      restack();
      showInspector();
    }

    function showInspector() {
      const item = placed.get(selected);
      inspector.hidden = !item;
      if (!item) return;
      $("#pg-selected").textContent = widgetInfo[item.kind]?.title || item.kind;
      const at = sizeIndex(item);
      customSize.textContent = `Custom (${Math.round(item.w / baseOf(item).w * 100)}%)`;
      customSize.hidden = at >= 0;
      sizeSelect.value = at < 0 ? "custom" : String(at);
      sizeResetButton.disabled = atThemeSize(item);
      // Only the themes that draw this kind of widget, and the desk's own at the top.
      for (const option of widgetTheme.options) if (option.value) option.hidden = !byId[option.value].sizes[item.kind];
      widgetTheme.options[0].textContent = `Desk theme (${theme.familyTitle})`;
      widgetTheme.value = item.skin || "";
      backdropSelect.value = item.backdrop || "";
      borderBox.checked = Boolean(item.border);
    }

    /** The all-widgets controls show a shared setting, or Mixed when the widgets differ. */
    function showAllBackdrops() {
      const items = [...placed.values()];
      const backdrops = new Set(items.map((item) => item.backdrop || "")), borders = new Set(items.map((item) => Boolean(item.border)));
      backdropAll.value = backdrops.size > 1 ? "mixed" : [...backdrops][0] ?? "";
      borderAll.indeterminate = borders.size > 1;
      borderAll.checked = borders.size === 1 && [...borders][0];
      backdropAll.disabled = borderAll.disabled = !items.length;
    }
    function setBackdrop(items, change) {
      for (const item of items) {
        change(item);
        if (!item.backdrop) delete item.backdrop;
        if (!item.border) delete item.border;
        dress(item);
      }
      showAllBackdrops();
      commit();
    }
    backdropSelect.addEventListener("change", () => {
      const item = placed.get(selected);
      if (item) setBackdrop([item], (it) => { it.backdrop = backdropSelect.value; });
    });
    borderBox.addEventListener("change", () => {
      const item = placed.get(selected);
      if (item) setBackdrop([item], (it) => { it.border = borderBox.checked; });
    });
    backdropAll.addEventListener("change", () => {
      if (backdropAll.value === "mixed") return;
      setBackdrop([...placed.values()], (it) => { it.backdrop = backdropAll.value; });
      showInspector();
    });
    borderAll.addEventListener("change", () => {
      setBackdrop([...placed.values()], (it) => { it.border = borderAll.checked; });
      showInspector();
    });

    SIZES.forEach(([, name], index) => sizeSelect.append(el("option", { value: String(index), textContent: name })));
    const customSize = el("option", { value: "custom", textContent: "Custom", hidden: true, disabled: true });
    sizeSelect.append(customSize);
    sizeResetButton.addEventListener("click", () => {
      const item = placed.get(selected);
      if (item) { setSize(item, themeRatio(item)); commit(); }
    });
    widgetTheme.append(el("option", { value: "", textContent: "Desk theme" }));
    for (const t of themes) widgetTheme.append(el("option", { value: t.id, textContent: t.title }));
    /** Redraws a widget in another theme at the same scale, about its centre. */
    widgetTheme.addEventListener("change", () => {
      const item = placed.get(selected);
      if (!item) return;
      const ratio = item.w / baseOf(item).w;
      if (widgetTheme.value && widgetTheme.value !== theme.id) item.skin = widgetTheme.value;
      else delete item.skin;
      tintRun++;
      tint(item).catch(() => {});
      setSize(item, ratio);
      commit();
    });
    sizeSelect.addEventListener("change", () => {
      const item = placed.get(selected);
      if (item && sizeSelect.value !== "custom") { setSize(item, SIZES[Number(sizeSelect.value)][0]); commit(); }
    });
    $("#pg-front").addEventListener("click", () => { if (placed.has(selected)) { setLayer(selected, true); commit(); } });
    $("#pg-back").addEventListener("click", () => { if (placed.has(selected)) { setLayer(selected, false); commit(); } });
    $("#pg-remove").addEventListener("click", () => { if (placed.has(selected)) remove(selected); });

    // MARK: Adding and removing

    function remove(uid) {
      finishGlide();
      const item = placed.get(uid);
      const title = widgetInfo[item.kind]?.title || item.kind;
      const hadFocus = item.node.contains(document.activeElement);
      if (selected === uid) choose(null);
      item.node.remove();
      placed.delete(uid);
      renderTray();
      layoutChanged();
      commit();
      say(`${title} removed.`, { undoable: true });
      if (hadFocus) tray.querySelector(`[data-kind="${item.kind}"]`)?.focus({ preventScroll: true });
    }

    /** A theme's widget for the desk: one of the desk's own unless it's from another theme. */
    const ownSkin = (skin) => (skin && skin !== theme.id && byId[skin] ? { skin } : {});

    function add(kind, skin) {
      // A new widget appears in the middle, then floats beside the others where it fits.
      const others = [...placed.values()];
      const own = ownSkin(skin), size = (byId[own.skin] || theme).sizes[kind];
      const target = others.length
        ? { x: others.reduce((s, o) => s + o.x + o.w / 2, 0) / others.length, y: others.reduce((s, o) => s + o.y + o.h / 2, 0) / others.length }
        : { x: canvas.width / 2, y: canvas.height / 2 };
      const item = place(kind, { ...own, x: (canvas.width - size.w) / 2, y: (canvas.height - size.h) / 2, w: size.w, h: size.h });
      if (look.accent) tint(item);
      const spot = Tidy.place(size, target, others, desk);
      renderTray();
      layoutChanged();
      // Nowhere free: everything shuffles up rather than the new widget hiding behind another.
      if (Tidy.clear([...others, spot], desk)) glide([{ item, x: spot.x, y: spot.y }], commit);
      else tidyAll(false);
    }

    // MARK: Placing a widget by hand

    /** The widget being carried on the pointer, until a click puts it down or Escape cancels it. */
    let carrying = null;
    function carry(kind, skin) {
      finishGlide();
      dropCarried(false);
      const own = ownSkin(skin), source = byId[own.skin] || theme;
      if (!source.sizes[kind]) return false;
      const size = source.sizes[kind];
      const item = place(kind, { ...own, x: clampX(size, (canvas.width - size.w) / 2), y: clampY(size, (canvas.height - size.h) / 2), w: size.w, h: size.h });
      item.node.classList.add("placing");
      if (look.accent) tint(item);
      carrying = item;
      choose(null);
      say(`Click where ${widgetInfo[kind]?.title || kind} should go. Arrow keys and Return work too; Esc cancels.`, { stay: true });
      layoutChanged();
      return true;
    }
    function follow(event) {
      if (!carrying) return;
      const box = stage.getBoundingClientRect(), s = scale();
      const x = clampX(carrying, (event.clientX - box.left) / s - carrying.w / 2);
      const y = clampY(carrying, (event.clientY - box.top) / s - carrying.h / 2);
      const others = [...placed.values()].filter((o) => o !== carrying);
      const spot = event.altKey ? { x, y, lines: [] } : Tidy.snap({ x, y, w: carrying.w, h: carrying.h }, desk, others);
      carrying.x = spot.x;
      carrying.y = spot.y;
      position(carrying);
      showGuides(spot.lines);
      layoutChanged();
    }
    /** Puts the carried widget down where it is, or takes it away again. */
    function dropCarried(keep) {
      if (!carrying) return;
      const item = carrying;
      carrying = null;
      showGuides([]);
      item.node.classList.remove("placing");
      if (keep) {
        renderTray();
        commit();
        item.node.focus({ preventScroll: true });
        say(onDrop || "Placed.", {});
        return;
      }
      item.node.remove();
      placed.delete(item.uid);
      say("");
      renderTray();
      scheduleRedraw();
    }
    window.addEventListener("pointermove", follow);
    // Before the widgets and the desk see it: the click that drops a widget does nothing else.
    window.addEventListener("pointerdown", (event) => {
      if (!carrying || !stage.contains(event.target)) return;
      event.preventDefault();
      event.stopPropagation();
      follow(event);
      dropCarried(true);
    }, true);
    window.addEventListener("keydown", (event) => {
      if (!carrying) return;
      const step = event.shiftKey ? 1 : 10;
      const delta = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[event.key];
      if (event.key === "Escape") dropCarried(false);
      else if (event.key === "Enter") dropCarried(true);
      else if (delta) {
        carrying.x = clampX(carrying, carrying.x + delta[0]);
        carrying.y = clampY(carrying, carrying.y + delta[1]);
        position(carrying);
        layoutChanged();
      } else return;
      event.preventDefault();
      event.stopPropagation();
    }, true);

    // MARK: The widget tray

    const trayTheme = $("#pg-tray-theme");
    trayTheme.append(el("option", { value: "", textContent: "This theme" }));
    for (const t of themes) trayTheme.append(el("option", { value: t.id, textContent: t.title }));
    trayTheme.addEventListener("change", renderTray);

    function renderTray() {
      showAllBackdrops();
      const focusedKind = tray.contains(document.activeElement) ? document.activeElement.dataset.kind : null;
      const source = byId[trayTheme.value] || theme;
      tray.replaceChildren();
      for (const kind of Object.keys(source.sizes)) {
        const count = [...placed.values()].filter((item) => item.kind === kind && skinOf(item) === source && item !== carrying).length;
        const title = widgetInfo[kind]?.title || kind;
        const chip = el("button", { className: `pg-add${count ? " on" : ""}`, type: "button" }, [
          el("img", { src: img(source.id, `widgets/${kind}.webp`), alt: "", loading: "lazy", width: 28, height: 28 }),
          el("span", { className: "pg-add-mark", textContent: count ? `×${count} +` : "+", ariaHidden: "true" }),
          el("span", { className: "pg-add-name", textContent: title }),
        ]);
        chip.dataset.kind = kind;
        chip.title = count ? `Add another ${title} (${count} on the desk)` : `Add ${title}`;
        chip.addEventListener("click", () => add(kind, source.id));
        tray.append(chip);
      }
      const total = [...placed.values()].filter((item) => item !== carrying).length;
      $("#pg-count").textContent = `${total} on the desk`;
      if (focusedKind) tray.querySelector(`[data-kind="${focusedKind}"]`)?.focus({ preventScroll: true });
    }

    // MARK: Accent and wallpaper

    const accentRow = $("#pg-accents"), accentWell = $("#pg-accent-custom"), accentNote = $("#pg-accent-note"), accentBox = $("#pg-accent-box");
    const widgetImage = (item) => img(skinOf(item).id, `widgets/${item.kind}.webp`);

    let tintRun = 0;
    /** Redraws a widget's image in the chosen accent, or puts the theme's own back. */
    async function tint(item, run = tintRun) {
      const image = item.node.querySelector("img"), source = widgetImage(item);
      if (image.dataset.tinted) { URL.revokeObjectURL(image.src); delete image.dataset.tinted; }
      // The accent belongs to the desk's theme; a widget from another keeps its own colours.
      if (!look.accent || skinOf(item) !== theme || !AccentTint.previewable(theme.accent)) { image.src = source; return; }
      const original = new Image();
      original.src = source;
      await original.decode();
      if (run !== tintRun || !item.node.isConnected) return;
      const board = Object.assign(document.createElement("canvas"), { width: original.naturalWidth, height: original.naturalHeight });
      const context = board.getContext("2d", { willReadFrequently: true });
      context.drawImage(original, 0, 0);
      const pixels = context.getImageData(0, 0, board.width, board.height);
      AccentTint.recolor(pixels.data, theme.accent, look.accent);
      context.putImageData(pixels, 0, 0);
      const blob = await new Promise((resolve) => board.toBlob(resolve));
      if (run !== tintRun || !item.node.isConnected) return;
      image.src = URL.createObjectURL(blob);
      image.dataset.tinted = "1";
    }
    const tintAll = () => { tintRun++; for (const item of placed.values()) tint(item).catch(() => {}); };

    function setAccent(color) {
      if (color && color.toUpperCase() === theme.accent.toUpperCase()) color = null;
      if (color) look = { ...look, accent: color.toUpperCase() };
      else { const { accent, ...rest } = look; look = rest; }
      tintAll();
      showWallpaper();
      showAccents();
      // The chosen colour has to reach the file, so the layout counts as the visitor's own now.
      layoutChanged();
      commit();
    }

    function showAccents() {
      const choices = theme.accents || [];
      accentBox.hidden = !choices.length;
      accentRow.replaceChildren();
      const current = look.accent || theme.accent;
      for (const choice of choices) {
        const swatch = el("button", { className: `swatch${choice.color.toUpperCase() === current.toUpperCase() ? " active" : ""}`, type: "button", title: choice.name });
        swatch.style.background = choice.color;
        swatch.setAttribute("aria-label", choice.name);
        swatch.addEventListener("click", () => setAccent(choice.color));
        accentRow.append(swatch);
      }
      accentWell.value = current.toLowerCase();
      accentNote.hidden = !look.accent || AccentTint.previewable(theme.accent);
    }
    let wellTimer = 0;
    accentWell.addEventListener("input", () => { clearTimeout(wellTimer); wellTimer = setTimeout(() => setAccent(accentWell.value), 150); });

    // MARK: The wallpaper picker

    const wallpaperButton = $("#pg-wallpaper"), wallpaperPanel = $("#pg-wallpaper-panel"), wallpaperFace = $("#pg-wallpaper-face"), wallpaperName = $("#pg-wallpaper-name");
    const uploadField = el("input", { type: "file", accept: "image/*", hidden: true });
    wallpaperPanel.after(uploadField);
    // Pictures chosen here, on the website: they last as long as the page and go nowhere.
    let uploaded = [];

    function chooseWallpaper(next) {
      const { wallpaper, custom, ...rest } = look;
      look = { ...rest, ...next };
      showWallpaper();
      layoutChanged();
      commit();
      showWallpaperPanel(false, true);
    }

    function wallpaperTile(title, url, on, pick) {
      const tile = el("button", { className: `pg-wall${on ? " active" : ""}`, type: "button", title }, [
        el("img", { src: url, alt: "", loading: "lazy" }),
        el("span", { textContent: title }),
      ]);
      tile.setAttribute("aria-pressed", on);
      tile.addEventListener("click", pick);
      return tile;
    }
    const wallpaperSection = (title, tiles) => el("section", {}, [el("h4", { textContent: title }), el("div", { className: "pg-wall-grid" }, tiles)]);

    async function fillWallpaperPanel() {
      const provided = wallpaperHost ? await wallpaperHost.list().catch(() => ({ extras: [], mine: [] })) : { extras: [], mine: uploaded };
      const isOn = (entry) => look.custom?.id === entry.id;
      const custom = (entry) => wallpaperTile(entry.title, entry.url, isOn(entry), () => chooseWallpaper({ custom: entry }));
      const own = byId[theme.id];
      const sections = [
        wallpaperSection("Theme wallpapers", [
          wallpaperTile(`${own.familyTitle} (this theme's)`, img(own.id, "wallpaper.webp"), !look.wallpaper && !look.custom, () => chooseWallpaper({})),
          ...themes.filter((t) => t !== own).map((t) => wallpaperTile(t.title, img(t.id, "wallpaper.webp"), look.wallpaper === t.id, () => chooseWallpaper({ wallpaper: t.id }))),
        ]),
      ];
      if (provided.extras.length) sections.push(wallpaperSection("Extras", provided.extras.map(custom)));
      const upload = el("button", { className: "pg-wall add", type: "button" }, [el("span", { textContent: "Upload…" })]);
      upload.addEventListener("click", async () => {
        if (!wallpaperHost) return uploadField.click();
        try {
          const entry = await wallpaperHost.choose();
          if (entry) chooseWallpaper({ custom: entry });
        } catch (error) { say(String(error?.message || error), { stay: true }); }
      });
      sections.push(wallpaperSection("Yours", [...provided.mine.map(custom), upload]));
      wallpaperPanel.replaceChildren(...sections);
    }
    uploadField.addEventListener("change", () => {
      const file = uploadField.files[0];
      uploadField.value = "";
      if (!file) return;
      if (!file.type.startsWith("image/")) return say("That file isn't a picture.");
      const entry = { id: `upload-${Date.now()}`, title: file.name.replace(/\.[^.]+$/, ""), url: URL.createObjectURL(file) };
      uploaded.push(entry);
      chooseWallpaper({ custom: entry });
    });

    const outsideWallpaper = (event) => { if (!event.target.closest(".pg-wallpaper-box")) showWallpaperPanel(false); };
    function showWallpaperPanel(open, refocus = false) {
      wallpaperPanel.hidden = !open;
      wallpaperButton.setAttribute("aria-expanded", String(open));
      if (open) {
        fillWallpaperPanel();
        document.addEventListener("pointerdown", outsideWallpaper);
      } else {
        document.removeEventListener("pointerdown", outsideWallpaper);
        if (refocus) wallpaperButton.focus({ preventScroll: true });
      }
    }
    wallpaperButton.addEventListener("click", () => showWallpaperPanel(wallpaperPanel.hidden));
    wallpaperPanel.addEventListener("keydown", (event) => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); showWallpaperPanel(false, true); }
    });

    let wallTintRun = 0, wallTinted = null;
    /** A theme whose wallpaper is drawn in its accent shows it recoloured, like its widgets. */
    async function tintWallpaper(url, run) {
      const original = new Image();
      original.src = url;
      await original.decode();
      if (run !== wallTintRun) return;
      const scale = Math.min(1, 1600 / original.naturalWidth);
      const board = Object.assign(document.createElement("canvas"), { width: Math.round(original.naturalWidth * scale), height: Math.round(original.naturalHeight * scale) });
      const context = board.getContext("2d", { willReadFrequently: true });
      context.drawImage(original, 0, 0, board.width, board.height);
      const pixels = context.getImageData(0, 0, board.width, board.height);
      AccentTint.recolor(pixels.data, theme.accent, look.accent);
      context.putImageData(pixels, 0, 0);
      const blob = await new Promise((resolve) => board.toBlob(resolve, "image/jpeg", 0.9));
      if (run !== wallTintRun) return;
      if (wallTinted) URL.revokeObjectURL(wallTinted);
      wallTinted = URL.createObjectURL(blob);
      stage.style.backgroundImage = `url("${wallTinted}")`;
      wallpaperFace.src = wallTinted;
    }

    function showWallpaper() {
      const url = look.custom?.url || img(look.wallpaper || theme.id, "wallpaper.webp");
      stage.style.backgroundImage = `url("${url}")`;
      wallpaperFace.src = url;
      const run = ++wallTintRun;
      if (!look.custom && !look.wallpaper && look.accent && theme.tintsWallpaper && AccentTint.previewable(theme.accent)) {
        tintWallpaper(url, run).catch(() => {});
      }
      wallpaperName.textContent = look.custom?.title || (look.wallpaper ? byId[look.wallpaper]?.title : "Theme's own");
    }

    /**
     * The theme's own layout. On a real display it goes where the app will put it: centred, with
     * room for the decoration, made smaller if it must be but never larger (as Presets.swift).
     */
    function ownLayout(of = theme) {
      if (!canvas.real) return of.layout;
      const frames = of.layout;
      const left = Math.min(...frames.map((f) => f.x)), top = Math.min(...frames.map((f) => f.y));
      const width = Math.max(...frames.map((f) => f.x + f.w)) - left, height = Math.max(...frames.map((f) => f.y + f.h)) - top;
      const fit = Math.min(1, (canvas.width - 112) / width, (canvas.height - 60) / height);
      return frames.map((f) => {
        const w = f.w * fit, h = f.h * fit;
        return {
          kind: f.kind, w, h,
          x: Math.round(canvas.width / 2 + (f.x + f.w / 2 - left - width / 2) * fit - w / 2),
          y: Math.round(canvas.height / 2 + (f.y + f.h / 2 - top - height / 2) * fit - h / 2),
        };
      });
    }

    function load(id, requestedMode = "auto", items = null, chosenLook = {}) {
      mode = ["auto", "light", "dark"].includes(requestedMode) ? requestedMode : "auto";
      const requested = byId[id] || themes[0], family = data.families.find((f) => f.id === requested.family);
      const selectedTheme = family.dark ? mode === "auto" ? autoVariant(family) : family[mode] : family.light;
      theme = byId[selectedTheme];
      look = chosenLook || {};
      dropCarried(false);
      carrying = null;
      // A theme with one look shows that, rather than a choice left over from the last theme.
      appearance.value = family.dark ? mode : "single";
      appearance.disabled = !family.dark;
      select.value = theme.light || !theme.partner ? theme.id : theme.partner;
      showTheme();
      choose(null);
      for (const item of placed.values()) item.node.remove();
      placed = new Map();
      gliding = null;
      glideRun++;
      // The still is a picture of the layout on the website's desk, so a real display draws its own.
      still.src = img(theme.id, "ornament.webp");
      still.hidden = Boolean(canvas.real);
      live.hidden = !canvas.real;
      drawing = false;
      sprites = Ornament.load(theme, (name) => img(theme.id, `sprites/${name}.webp`), scheduleRedraw);
      for (const frame of items || ownLayout()) {
        const base = theme.sizes[frame.kind];
        // Paired variants may have different base shapes; keep the centre and scale.
        const opposite = !frame.skin && theme.partner && byId[theme.partner].sizes[frame.kind];
        if (items && opposite && Math.abs(frame.w / base.w - frame.h / base.h) > 0.02) {
          const ratio = Math.min(350 / 170, frame.w / opposite.w);
          const w = Math.round(base.w * ratio), h = Math.round(base.h * ratio);
          place(frame.kind, { ...frame, w, h, x: Math.max(0, Math.min(canvas.width - w, frame.x + (frame.w - w) / 2)), y: Math.max(menuBar, Math.min(canvas.height - h, frame.y + (frame.h - h) / 2)) });
        } else place(frame.kind, frame);
      }
      if (items) layoutChanged();
      else if (canvas.real) scheduleRedraw();
      showWallpaper();
      showAccents();
      if (look.accent) tintAll();
      renderTray();
    }

    new ResizeObserver(() => {
      placed.forEach(position);
      scheduleRedraw();
    }).observe(stage);

    tip.textContent = matchMedia("(pointer: coarse)").matches
      ? "Touch and hold a widget, then drag it. Tap one for its size."
      : "Drag widgets to move them. Click one for its size and layer.";
    const wallpaperHost = options.wallpapers || null;
    const onDrop = options.placedMessage || null;
    const initial = LayoutShare.read(location.search, data);
    const { accent, wallpaper } = initial;
    load(initial.theme, initial.mode, initial.items, { ...(accent ? { accent } : {}), ...(wallpaper ? { wallpaper } : {}) });
    history.push(snapshot());
    syncUndo();
    return {
      load: (id, nextMode) => { load(id, nextMode); commit(); },
      /** What's on the desk now; `edited` is false while it's still the theme's own layout. */
      current: () => ({ state: state(), skin: theme.id, title: theme.familyTitle, edited: drawing, accent: look.accent || null, wallpaperFile: look.custom?.id || null }),
      say,
      /** Picks up a new widget on the pointer, for the visitor to put down where they want it. */
      carry,
      /** Shows a picture of the person's own as the wallpaper, as the app remembered it. */
      showCustomWallpaper: (entry) => { look = { ...look, custom: entry }; delete look.wallpaper; showWallpaper(); },
    };
  }

  window.Playground = { catalog, create: createPlayground, themePicker, img, autoVariant, desktopSystem, systemDark, reduceMotion };
})();
