/* The script inside the EPUB reader WebView. Talks to React Native through
 * window.ReactNativeWebView.postMessage and window.readerCommand(json). */
(function () {
  var book = null;
  var rendition = null;
  var toc = [];
  // Big books arrive in pieces: one giant injected script is slow and can
  // take the WebView down, so React Native sends the base64 in chunks first.
  var chunks = [];
  var post = function (msg) {
    try { window.ReactNativeWebView.postMessage(JSON.stringify(msg)); } catch (e) {}
  };
  window.onerror = function (message) { post({ type: "error", message: String(message) }); };

  function applyLook(look) {
    if (!rendition || !look) return;
    document.body.style.background = look.bg;
    rendition.themes.default({
      body: { background: look.bg + " !important", color: look.text + " !important", "font-family": look.font || "inherit", "line-height": "1.55" },
      "a, a:link, a:visited": { color: look.text + " !important" },
      p: { "font-family": look.font || "inherit" },
      // Covers and full-page pictures: never wider or taller than the page,
      // never cut off — scale down and keep their shape.
      "img, svg, image, video": {
        "max-width": "100% !important",
        "max-height": "calc(100vh - 16px) !important",
        "object-fit": "contain !important",
        "box-sizing": "border-box !important"
      },
      img: { height: "auto !important", width: "auto !important" },
      "figure, .image, div.img, p.img": { "page-break-inside": "avoid !important", "break-inside": "avoid !important" }
    });
    rendition.themes.fontSize(look.fontSize + "px");
  }

  var stripHash = function (href) { return String(href || "").split("#")[0]; };
  var sameFile = function (a, b) {
    a = stripHash(a); b = stripHash(b);
    if (!a || !b) return false;
    return a === b || a.slice(-b.length) === b || b.slice(-a.length) === a;
  };

  function flatten(items, depth, out) {
    (items || []).forEach(function (item) {
      out.push({ label: String(item.label || "").trim(), href: item.href, depth: depth });
      flatten(item.subitems, depth + 1, out);
    });
    return out;
  }

  /** The table-of-contents entry for the file on screen (the last one that points into it). */
  function chapterFor(href) {
    var found = "";
    for (var i = 0; i < toc.length; i++) if (sameFile(toc[i].href, href)) { found = toc[i].label; break; }
    return found;
  }

  function report(location) {
    if (!location || !location.start) return;
    var cfi = location.start.cfi;
    var pct = null;
    if (book.locations && book.locations.length()) pct = book.locations.percentageFromCfi(cfi);
    else if (location.start.percentage) pct = location.start.percentage;
    var shown = location.start.displayed || {};
    post({
      type: "relocated",
      cfi: cfi,
      progress: pct,
      atEnd: !!location.atEnd,
      chapter: chapterFor(location.start.href),
      chapterPage: shown.page || null,
      chapterPages: shown.total || null
    });
  }

  window.readerCommand = function (json) {
    var cmd = typeof json === "string" ? JSON.parse(json) : json;
    if (cmd.type === "chunk") {
      chunks.push(cmd.data);
      return;
    }
    if (cmd.type === "open") {
      try {
        var data = cmd.base64 != null ? cmd.base64 : chunks.join("");
        chunks = [];
        book = ePub();
        book.open(data, "base64");
        rendition = book.renderTo("viewer", { width: "100%", height: "100%", flow: "paginated", spread: "none", allowScriptedContent: false });
        applyLook(cmd.look);
        rendition.on("relocated", report);
        book.loaded.navigation
          .then(function (nav) {
            toc = flatten(nav && nav.toc, 0, []);
            post({ type: "toc", items: toc });
          })
          .catch(function () {});
        book.ready
          .then(function () {
            return rendition.display(cmd.cfi || undefined);
          })
          .then(function () {
            post({ type: "ready", title: (book.packaging && book.packaging.metadata && book.packaging.metadata.title) || "" });
            // Percentages need the location map; build it after the first page shows.
            return book.locations.generate(1200);
          })
          .then(function () {
            post({ type: "locations" });
            if (rendition.currentLocation()) report(rendition.currentLocation());
          })
          .catch(function (e) { post({ type: "error", message: String(e && e.message || e) }); });
      } catch (e) {
        post({ type: "error", message: String(e && e.message || e) });
      }
    } else if (cmd.type === "next" && rendition) rendition.next();
    else if (cmd.type === "prev" && rendition) rendition.prev();
    else if (cmd.type === "look") applyLook(cmd.look);
    else if (cmd.type === "href" && rendition && cmd.href) rendition.display(cmd.href);
    else if (cmd.type === "goto" && rendition && book && book.locations.length()) {
      rendition.display(book.locations.cfiFromPercentage(Math.min(0.9999, Math.max(0, cmd.progress))));
    }
  };
  post({ type: "loaded" });
})();
