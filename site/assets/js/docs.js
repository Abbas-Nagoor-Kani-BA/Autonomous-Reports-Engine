/*
 * docs.js — client-side wiki renderer for the Autonomous Reports Engine site.
 *
 * On DOMContentLoaded it:
 *   1. reads the page name from ?p= (default "Home"),
 *   2. fetches docs/<PageName>.md and renders it with marked,
 *   3. converts ```mermaid fenced blocks to <div class="mermaid"> in a .diagram
 *      wrapper and runs mermaid with a dark, palette-tuned theme,
 *   4. rewrites bare wiki links / *.md links to docs.html?p=... and resolves
 *      images/*.png to docs/images/*.png,
 *   5. builds the sidebar from docs/_Sidebar.md and highlights the current page,
 *   6. renders docs/_Footer.md under the article when present,
 *   7. shows a friendly message when a page is missing.
 *
 * The pure helpers (rewriteHref, resolveImageSrc, pageNameFromQuery, etc.) are
 * exported for Node/happy-dom testing via module.exports when running under a
 * CommonJS-ish environment; in the browser they attach to window.DocsRenderer.
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api; // Node / test
  }
  if (typeof window !== "undefined") {
    window.DocsRenderer = api; // browser
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var DEFAULT_PAGE = "Home";

  // ---- Pure helpers (unit-testable) -----------------------------------------

  // True for absolute schemes we must never rewrite.
  function hasScheme(href) {
    return /^[a-z][a-z0-9+.-]*:/i.test(href);
  }

  /**
   * Rewrite an anchor href according to the wiki-link rules:
   *   - http(s), mailto:, other schemes  -> unchanged
   *   - in-page #anchors                 -> unchanged
   *   - root-absolute (/foo)             -> unchanged
   *   - "Name.md" / "Sub/Name.md"        -> docs.html?p=<name-without-.md>
   *   - "images/x.png" (or other assets) -> unchanged here (handled by images)
   *   - bare wiki link ("Caching", "Data-Viewer") -> docs.html?p=<that>
   */
  function rewriteHref(href) {
    if (href == null) return href;
    var raw = String(href).trim();
    if (raw === "") return href;

    // In-page anchors — leave alone.
    if (raw.charAt(0) === "#") return raw;
    // Root-absolute paths — leave alone.
    if (raw.charAt(0) === "/") return raw;
    // Absolute URLs (http:, https:, mailto:, etc.) — leave alone.
    if (hasScheme(raw)) return raw;
    // Protocol-relative URLs — leave alone.
    if (raw.slice(0, 2) === "//") return raw;

    // Split off any #fragment and ?query so we can preserve the fragment.
    var frag = "";
    var hashIdx = raw.indexOf("#");
    if (hashIdx !== -1) {
      frag = raw.slice(hashIdx); // includes leading #
      raw = raw.slice(0, hashIdx);
    }
    if (raw === "") return frag; // was just "#frag" after trimming

    // Explicit .md link -> strip extension, route through docs.html.
    if (/\.md$/i.test(raw)) {
      var mdName = raw.replace(/\.md$/i, "");
      // keep only the final path segment as the page id
      mdName = mdName.split("/").pop();
      return "docs.html?p=" + encodeURIComponent(mdName) + frag;
    }

    // Non-.md files (images, pdfs, css, etc.) — leave alone.
    if (/\.[a-z0-9]{1,5}$/i.test(raw)) return raw + frag;

    // Bare wiki link — route through docs.html.
    var name = raw.split("/").pop();
    return "docs.html?p=" + encodeURIComponent(name) + frag;
  }

  /**
   * Resolve an <img> src. Relative "images/x.png" (or "x.png") that is not a
   * scheme/absolute becomes "docs/images/x.png". Absolute or already-docs
   * paths are left alone.
   */
  function resolveImageSrc(src) {
    if (src == null) return src;
    var raw = String(src).trim();
    if (raw === "") return src;
    if (raw.charAt(0) === "/") return raw;
    if (hasScheme(raw)) return raw;
    if (raw.slice(0, 2) === "//") return raw;
    if (raw.indexOf("docs/") === 0) return raw; // already resolved
    if (/^images\//i.test(raw)) return "docs/" + raw;
    // Bare filename -> assume it lives under docs/images
    if (raw.indexOf("/") === -1) return "docs/images/" + raw;
    return raw;
  }

  // Read ?p=PageName from a query/search string. Falls back to DEFAULT_PAGE.
  function pageNameFromQuery(search) {
    var s = String(search || "");
    var m = s.match(/[?&]p=([^&#]*)/);
    if (!m) return DEFAULT_PAGE;
    var val = "";
    try {
      val = decodeURIComponent(m[1].replace(/\+/g, " "));
    } catch (e) {
      val = m[1];
    }
    val = val.trim();
    return val === "" ? DEFAULT_PAGE : val;
  }

  // Is a code block's class a mermaid block? marked emits "language-mermaid".
  function isMermaidCodeClass(className) {
    return /(^|\s)language-mermaid(\s|$)/.test(String(className || ""));
  }

  // ---- DOM-dependent rendering (browser only) -------------------------------

  function renderMarkdown(md) {
    // marked v12 UMD exposes `marked.parse` and a callable `marked`.
    if (typeof marked !== "undefined") {
      if (typeof marked.parse === "function") return marked.parse(md);
      if (typeof marked === "function") return marked(md);
    }
    // Fallback: escape and wrap in <pre> so nothing breaks.
    var div = document.createElement("div");
    div.textContent = md;
    return "<pre>" + div.innerHTML + "</pre>";
  }

  // Convert <pre><code class="language-mermaid">…</code></pre> into
  // <div class="diagram"><div class="mermaid">…</div></div>.
  function extractMermaid(container) {
    var count = 0;
    var codes = container.querySelectorAll("pre > code");
    Array.prototype.forEach.call(codes, function (code) {
      if (!isMermaidCodeClass(code.className)) return;
      var pre = code.parentNode;
      var source = code.textContent;

      var wrapper = document.createElement("div");
      wrapper.className = "diagram";
      var target = document.createElement("div");
      target.className = "mermaid";
      target.textContent = source;
      wrapper.appendChild(target);

      pre.parentNode.replaceChild(wrapper, pre);
      count++;
    });
    return count;
  }

  // Rewrite all anchor hrefs and image srcs inside a container.
  function rewriteLinks(container) {
    Array.prototype.forEach.call(container.querySelectorAll("a[href]"), function (a) {
      a.setAttribute("href", rewriteHref(a.getAttribute("href")));
    });
    Array.prototype.forEach.call(container.querySelectorAll("img[src]"), function (img) {
      img.setAttribute("src", resolveImageSrc(img.getAttribute("src")));
    });
  }

  function mermaidThemeVariables() {
    // Catppuccin Mocha, tuned for readable dark diagrams.
    return {
      background: "#181825",
      primaryColor: "#1e1e2e",
      primaryTextColor: "#cdd6f4",
      primaryBorderColor: "#89b4fa",
      secondaryColor: "#313244",
      secondaryTextColor: "#cdd6f4",
      secondaryBorderColor: "#585b70",
      tertiaryColor: "#11111b",
      tertiaryTextColor: "#cdd6f4",
      tertiaryBorderColor: "#45475a",
      lineColor: "#89b4fa",
      textColor: "#cdd6f4",
      mainBkg: "#1e1e2e",
      nodeBorder: "#89b4fa",
      clusterBkg: "#11111b",
      clusterBorder: "#45475a",
      edgeLabelBackground: "#181825",
      titleColor: "#cdd6f4",
      noteBkgColor: "#313244",
      noteTextColor: "#cdd6f4",
      noteBorderColor: "#585b70",
      actorBkg: "#1e1e2e",
      actorBorder: "#89b4fa",
      actorTextColor: "#cdd6f4",
      fontFamily:
        'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    };
  }

  function runMermaid() {
    if (typeof mermaid === "undefined") return;
    try {
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: "loose",
        theme: "dark",
        themeVariables: mermaidThemeVariables(),
      });
    } catch (e) {
      /* initialize is idempotent-ish; ignore */
    }
    var nodes = document.querySelectorAll("#docs-content .mermaid");
    if (!nodes.length) return;
    try {
      if (typeof mermaid.run === "function") {
        mermaid.run({ nodes: nodes });
      } else if (typeof mermaid.init === "function") {
        mermaid.init(undefined, nodes);
      }
    } catch (e) {
      // A single bad diagram should not blank the page.
      /* eslint-disable no-console */
      if (typeof console !== "undefined") console.warn("mermaid render failed", e);
      /* eslint-enable no-console */
    }
  }

  // ---- Sidebar --------------------------------------------------------------

  /*
   * Parse _Sidebar.md into a structure of sections. The wiki sidebar looks like:
   *   ### [Home](Home)
   *   **User Guide**
   *   - [Installation](Installation)
   *   ...
   *   **Developer Guide**
   *   - [Architecture](Architecture)
   * We render the top ### link as a standalone home link, **bold** lines as
   * section headings, and list items as links.
   */
  function buildSidebar(nav, sidebarMd, currentPage) {
    nav.innerHTML = "";
    var lines = String(sidebarMd).split(/\r?\n/);
    var currentList = null;

    function linkFor(text, target) {
      var a = document.createElement("a");
      a.href = "docs.html?p=" + encodeURIComponent(target);
      a.textContent = text;
      if (decodeURIComponent(target) === currentPage || target === currentPage) {
        a.className = "is-active";
        a.setAttribute("aria-current", "page");
      }
      return a;
    }

    lines.forEach(function (line) {
      var t = line.trim();
      if (t === "" || t === "---") return;

      // Top home link: "### [Home](Home)"
      var head = t.match(/^#{1,6}\s*\[([^\]]+)\]\(([^)]+)\)\s*$/);
      if (head) {
        var homeLink = linkFor(head[1], head[2].trim());
        homeLink.className =
          "docs-sidebar-home" + (homeLink.className === "is-active" ? " is-active" : "");
        nav.appendChild(homeLink);
        currentList = null;
        return;
      }

      // Section heading: "**User Guide**" (or a bare heading line)
      var bold = t.match(/^\*\*(.+?)\*\*$/);
      if (bold) {
        var h = document.createElement("p");
        h.className = "docs-sidebar-section";
        h.textContent = bold[1];
        nav.appendChild(h);
        currentList = document.createElement("ul");
        nav.appendChild(currentList);
        return;
      }

      // List item link: "- [Installation](Installation)"
      var item = t.match(/^[-*]\s*\[([^\]]+)\]\(([^)]+)\)\s*$/);
      if (item) {
        if (!currentList) {
          currentList = document.createElement("ul");
          nav.appendChild(currentList);
        }
        var li = document.createElement("li");
        li.appendChild(linkFor(item[1], item[2].trim()));
        currentList.appendChild(li);
        return;
      }
    });
  }

  // ---- Orchestration --------------------------------------------------------

  function docFetch(url) {
    return fetch(url, { cache: "no-cache" }).then(function (res) {
      return { ok: res.ok, status: res.status, text: res.ok ? res.text() : Promise.resolve("") };
    });
  }

  function showError(content, page) {
    content.innerHTML = "";
    var div = document.createElement("div");
    div.className = "docs-error";
    div.innerHTML =
      "<strong>Page not found.</strong> The documentation page <code>" +
      escapeHtml(page) +
      "</code> could not be loaded. It may not have been migrated yet — " +
      'try the <a href="docs.html?p=Home">documentation home</a>.';
    content.appendChild(div);
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function renderFooter(content, footerMd) {
    if (!footerMd || !String(footerMd).trim()) return;
    var footer = document.createElement("div");
    footer.className = "docs-footer";
    footer.innerHTML = renderMarkdown(footerMd);
    rewriteLinks(footer);
    content.appendChild(footer);
  }

  function renderPage(page) {
    var content = document.getElementById("docs-content");
    if (!content) return;

    fetch("docs/" + page + ".md", { cache: "no-cache" })
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.text();
      })
      .then(function (md) {
        content.innerHTML = renderMarkdown(md);
        var mermaidCount = extractMermaid(content);
        rewriteLinks(content);
        document.title = deriveTitle(md, page);
        return mermaidCount;
      })
      .then(function () {
        runMermaid();
        // Footer is best-effort; a missing/empty footer is fine.
        return fetch("docs/_Footer.md", { cache: "no-cache" })
          .then(function (r) {
            return r.ok ? r.text() : "";
          })
          .then(function (footerMd) {
            renderFooter(content, footerMd);
          })
          .catch(function () {});
      })
      .catch(function () {
        showError(content, page);
      });
  }

  function deriveTitle(md, page) {
    var m = String(md).match(/^#\s+(.+?)\s*$/m);
    var name = m ? m[1] : page.replace(/-/g, " ");
    return name + " — Autonomous Reports Engine";
  }

  function loadSidebar(currentPage) {
    var nav = document.getElementById("docs-sidebar");
    if (!nav) return;
    fetch("docs/_Sidebar.md", { cache: "no-cache" })
      .then(function (res) {
        return res.ok ? res.text() : "";
      })
      .then(function (sidebarMd) {
        if (sidebarMd && sidebarMd.trim()) {
          buildSidebar(nav, sidebarMd, currentPage);
        } else {
          nav.innerHTML = '<p class="docs-sidebar-loading">Navigation unavailable.</p>';
        }
      })
      .catch(function () {
        nav.innerHTML = '<p class="docs-sidebar-loading">Navigation unavailable.</p>';
      });
  }

  function init() {
    var page = pageNameFromQuery(
      typeof location !== "undefined" ? location.search : "",
    );
    loadSidebar(page);
    renderPage(page);
  }

  if (typeof document !== "undefined" && document.addEventListener) {
    document.addEventListener("DOMContentLoaded", init);
  }

  // ---- Public API (for tests) ----
  return {
    rewriteHref: rewriteHref,
    resolveImageSrc: resolveImageSrc,
    pageNameFromQuery: pageNameFromQuery,
    isMermaidCodeClass: isMermaidCodeClass,
    buildSidebar: buildSidebar,
    extractMermaid: extractMermaid,
    rewriteLinks: rewriteLinks,
    DEFAULT_PAGE: DEFAULT_PAGE,
  };
});
