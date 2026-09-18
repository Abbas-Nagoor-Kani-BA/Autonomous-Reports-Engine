/*
 * Shared site chrome: header + primary nav + footer.
 *
 * Every page includes this script and calls nothing — it self-initializes on
 * DOMContentLoaded. Pages declare their location with `data-site-page` on the
 * <body> (one of: home, panel, viewer, settings, docs) so the active nav link
 * can be highlighted. A `data-site-root` attribute on <body> gives the relative
 * path back to site/ root (e.g. "." for index.html, ".." for surfaces/*.html).
 */
(function () {
  "use strict";

  function rootPrefix() {
    const root = document.body.getAttribute("data-site-root");
    return root && root.length ? root.replace(/\/$/, "") : ".";
  }

  const NAV = [
    { key: "home", label: "Overview", href: "index.html" },
    { key: "panel", label: "Side Panel", href: "surfaces/panel.html" },
    { key: "viewer", label: "Data Viewer", href: "surfaces/viewer.html" },
    { key: "settings", label: "Settings", href: "surfaces/settings.html" },
    { key: "docs", label: "Docs", href: "docs.html?p=Home" }
  ];

  function buildHeader(active, root) {
    const header = document.createElement("header");
    header.className = "site-header";

    const inner = document.createElement("div");
    inner.className = "site-header-inner";

    const brand = document.createElement("a");
    brand.className = "site-brand";
    brand.href = root + "/index.html";
    brand.innerHTML =
      '<span class="site-brand-dot" aria-hidden="true"></span>' +
      '<span class="site-brand-name">Autonomous Reports Engine</span>' +
      '<span class="site-brand-tag">docs &amp; UI guide</span>';
    inner.appendChild(brand);

    const nav = document.createElement("nav");
    nav.className = "site-nav";
    nav.setAttribute("aria-label", "Primary");

    NAV.forEach(function (item) {
      const a = document.createElement("a");
      a.className = "site-nav-link" + (item.key === active ? " is-active" : "");
      a.href = root + "/" + item.href;
      a.textContent = item.label;
      if (item.key === active) a.setAttribute("aria-current", "page");
      nav.appendChild(a);
    });

    inner.appendChild(nav);
    header.appendChild(inner);
    return header;
  }

  function buildFooter(root) {
    const footer = document.createElement("footer");
    footer.className = "site-footer";
    footer.innerHTML =
      '<div class="site-footer-inner">' +
      "<p>Autonomous Reports Engine · Chrome MV3 extension for ServiceNow SLA reporting. " +
      "This is a static documentation site — the mockups are illustrative, with sample data and no live connection.</p>" +
      '<p class="site-footer-meta">Source of truth for the docs lives in <code>wiki/</code>; the UI mockups mirror ' +
      "<code>panel/</code>, <code>viewer/</code> and <code>settings/</code>.</p>" +
      "</div>";
    return footer;
  }

  document.addEventListener("DOMContentLoaded", function () {
    const active = document.body.getAttribute("data-site-page") || "";
    const root = rootPrefix();

    const headerMount = document.getElementById("site-header");
    if (headerMount) headerMount.replaceWith(buildHeader(active, root));

    const footerMount = document.getElementById("site-footer");
    if (footerMount) footerMount.replaceWith(buildFooter(root));
  });
})();
