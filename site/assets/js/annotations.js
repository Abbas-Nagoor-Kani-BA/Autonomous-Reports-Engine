/*
 * annotations.js — reusable, data-driven, accessible annotation / hotspot system.
 *
 * A page decorates its mockup with numbered markers ("callouts") that each open a
 * popover describing a feature. All annotations are also rendered into a plain
 * "feature reference" list so the content is readable even if visual positioning
 * fails (or the user prefers a list).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * USAGE
 * ─────────────────────────────────────────────────────────────────────────────
 *   <link rel="stylesheet" href="assets/css/annotations.css">
 *   <script src="assets/js/annotations.js"></script>
 *   <script>
 *     document.addEventListener("DOMContentLoaded", function () {
 *       Annotations.init({
 *         items: [
 *           { sel: "#run-btn",  title: "Run analysis",  body: "Starts the SLA pull. <em>Sample only.</em>" },
 *           { sel: ".search",   title: "Filter tickets", body: "Type an incident number to narrow the list." },
 *           { sel: "#results",  title: "Results table",  body: "Sortable, exportable to the MSR workbook." }
 *         ],
 *         mountRef: "#feature-reference"   // optional
 *       });
 *     });
 *   </script>
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * API
 * ─────────────────────────────────────────────────────────────────────────────
 *   Annotations.init(options) -> controller
 *
 *   options.items     : Array<Item>    (required)  — annotation definitions, in order.
 *   options.mountRef  : string|Element (optional)  — where to render the feature
 *                                                    reference list. If omitted, no
 *                                                    list is rendered.
 *   options.toggleRef : string|Element (optional)  — an existing toggle button.
 *                                                    Defaults to "#toggle-callouts";
 *                                                    if not found, a floating toggle
 *                                                    is auto-created.
 *
 *   Item = {
 *     sel   : string      // CSS selector; the FIRST match is the marker target.
 *     title : string      // short heading (plain text).
 *     body  : string      // description; may contain simple/trusted HTML.
 *     n     : number?     // optional explicit badge number; otherwise 1-based index.
 *   }
 *
 *   Returned controller = {
 *     show(), hide(), toggle(),   // show/hide ALL markers
 *     open(index), close(),       // open/close a popover by 0-based index
 *     reposition(),               // recompute marker positions
 *     destroy()                   // remove everything created by this instance
 *   }
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * BEHAVIOUR NOTES
 * ─────────────────────────────────────────────────────────────────────────────
 *  - Markers are <button> elements appended to document.body, positioned over the
 *    top-right corner of each target via getBoundingClientRect (page coordinates),
 *    kept in sync on load/resize/scroll. They never alter the mockup's own layout.
 *  - Numbering follows the items array order (or the explicit `n`).
 *  - Targets that are missing or display:none are skipped visually but still
 *    listed in the feature reference.
 *  - Only one popover is open at a time. Click a marker, or focus + Enter/Space,
 *    to toggle. Escape closes and returns focus to the marker.
 *  - The popover is role="dialog", aria-labelled by the title, and receives focus
 *    when opened.
 *  - Markers are visible by default; the toggle shows/hides them all.
 *  - No frameworks, no external dependencies. Global: window.Annotations.
 */
(function (global) {
  "use strict";

  var idSeq = 0;

  function resolveEl(ref) {
    if (!ref) return null;
    if (typeof ref === "string") return document.querySelector(ref);
    if (ref.nodeType === 1) return ref;
    return null;
  }

  function isVisible(el) {
    if (!el) return false;
    // Honour display:none / visibility:hidden via computed style — the most
    // reliable signal across engines. An ancestor chain that is display:none
    // also collapses the element's own rendered box, which offsetParent detects.
    if (typeof window.getComputedStyle === "function") {
      var cs = window.getComputedStyle(el);
      if (cs && (cs.display === "none" || cs.visibility === "hidden")) return false;
    }
    // offsetParent is null for display:none subtrees in a real layout engine.
    // (Some engines report undefined; treat only an explicit null as hidden.)
    if (el.offsetParent === null) {
      var rect = el.getBoundingClientRect();
      return rect.width > 0 || rect.height > 0;
    }
    return true;
  }

  function create(tag, className, attrs) {
    var el = document.createElement(tag);
    if (className) el.className = className;
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        el.setAttribute(k, attrs[k]);
      });
    }
    return el;
  }

  function prefersReducedMotion() {
    return (
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    );
  }

  function Controller(options) {
    var opts = options || {};
    var items = Array.isArray(opts.items) ? opts.items : [];

    this._items = items;
    this._entries = []; // { item, index, num, target, marker, refItem }
    this._popover = null;
    this._openIndex = -1;
    this._activeMarker = null;
    this._destroyed = false;
    this._visible = true;
    this._instanceId = "anno-" + ++idSeq;

    this._boundReposition = this._reposition.bind(this);
    this._boundKeydown = this._onKeydown.bind(this);
    this._boundDocClick = this._onDocClick.bind(this);

    this._build(opts);
  }

  Controller.prototype._build = function (opts) {
    var self = this;

    this._items.forEach(function (item, index) {
      var num = typeof item.n === "number" ? item.n : index + 1;
      var target = null;
      try {
        target = item.sel ? document.querySelector(item.sel) : null;
      } catch (e) {
        target = null; // invalid selector — skip gracefully
      }

      var entry = {
        item: item,
        index: index,
        num: num,
        target: target,
        marker: null,
        refItem: null,
      };

      // A marker is created only when a visible target exists.
      if (target && isVisible(target)) {
        entry.marker = self._makeMarker(entry);
        document.body.appendChild(entry.marker);
      }

      self._entries.push(entry);
    });

    // Feature reference list (always render every item if a mount is given).
    this._buildReference(opts.mountRef);

    // Toggle control.
    this._buildToggle(opts.toggleRef);

    // Global listeners.
    window.addEventListener("resize", this._boundReposition, { passive: true });
    window.addEventListener("scroll", this._boundReposition, { passive: true });
    document.addEventListener("keydown", this._boundKeydown, true);
    document.addEventListener("click", this._boundDocClick, true);

    this._reposition();
  };

  Controller.prototype._makeMarker = function (entry) {
    var self = this;
    var title = entry.item.title || "Annotation " + entry.num;
    var marker = create("button", "anno-marker", {
      type: "button",
      "aria-label": "Annotation " + entry.num + ": " + title,
      "aria-expanded": "false",
      "data-anno-index": String(entry.index),
    });
    marker.textContent = String(entry.num);

    marker.addEventListener("click", function (ev) {
      ev.preventDefault();
      ev.stopPropagation();
      self.togglePopover(entry.index);
    });
    // <button> already fires click on Enter/Space; prevent Space from scrolling.
    marker.addEventListener("keydown", function (ev) {
      if (ev.key === " " || ev.key === "Spacebar") ev.preventDefault();
    });

    return marker;
  };

  Controller.prototype._buildReference = function (mountRef) {
    var self = this;
    var mount = resolveEl(mountRef);
    if (!mount) return;

    var list = create("ol", "anno-reference");
    list.setAttribute("aria-label", "Feature reference");

    this._entries.forEach(function (entry) {
      var li = create("li", "anno-reference-item", {
        "data-anno-index": String(entry.index),
      });

      var btn = create("button", "anno-reference-btn", { type: "button" });

      var chip = create("span", "anno-reference-chip", { "aria-hidden": "true" });
      chip.textContent = String(entry.num);

      var textWrap = create("span", "anno-reference-text");
      var titleEl = create("span", "anno-reference-title");
      titleEl.textContent = entry.item.title || "Annotation " + entry.num;
      var bodyEl = create("span", "anno-reference-body");
      bodyEl.innerHTML = entry.item.body || "";

      textWrap.appendChild(titleEl);
      textWrap.appendChild(bodyEl);
      btn.appendChild(chip);
      btn.appendChild(textWrap);
      li.appendChild(btn);

      btn.addEventListener("click", function () {
        self._highlight(entry);
      });

      entry.refItem = li;
      list.appendChild(li);
    });

    mount.appendChild(list);
    this._referenceList = list;
  };

  Controller.prototype._buildToggle = function (toggleRef) {
    var self = this;
    var existing = resolveEl(toggleRef) || document.getElementById("toggle-callouts");
    var btn;

    if (existing && existing.tagName === "BUTTON") {
      btn = existing;
      this._createdToggle = null;
    } else {
      btn = create("button", "anno-toggle", { type: "button" });
      btn.id = "toggle-callouts-" + this._instanceId;
      document.body.appendChild(btn);
      this._createdToggle = btn;
    }

    btn.setAttribute("aria-pressed", "true");
    this._toggle = btn;
    this._syncToggleLabel();

    this._boundToggleClick = function () {
      self.toggle();
    };
    btn.addEventListener("click", this._boundToggleClick);
  };

  Controller.prototype._syncToggleLabel = function () {
    if (!this._toggle) return;
    this._toggle.textContent = this._visible ? "Hide callouts" : "Show callouts";
    this._toggle.setAttribute("aria-pressed", this._visible ? "true" : "false");
  };

  // ── Positioning ────────────────────────────────────────────────────────────
  Controller.prototype._reposition = function () {
    if (this._destroyed) return;
    var self = this;
    this._entries.forEach(function (entry) {
      if (!entry.marker) return;
      var target = entry.target;
      if (!target || !isVisible(target)) {
        entry.marker.style.display = "none";
        return;
      }
      if (self._visible) entry.marker.style.display = "";
      var rect = target.getBoundingClientRect();
      var x = rect.right + window.pageXOffset;
      var y = rect.top + window.pageYOffset;
      // Pin to the top-right corner of the target, nudged so the badge overlaps.
      entry.marker.style.left = x - 11 + "px";
      entry.marker.style.top = y - 11 + "px";
    });
    if (this._popover && this._openIndex >= 0) {
      this._positionPopover(this._entries[this._openIndex]);
    }
  };

  Controller.prototype.reposition = function () {
    this._reposition();
  };

  // ── Popover ────────────────────────────────────────────────────────────────
  Controller.prototype.togglePopover = function (index) {
    if (this._openIndex === index) this.close();
    else this.open(index);
  };

  Controller.prototype.open = function (index) {
    var entry = this._entries[index];
    if (!entry || !entry.marker) return;

    this.close();

    var titleText = entry.item.title || "Annotation " + entry.num;
    var pop = create("div", "anno-popover", {
      role: "dialog",
      "aria-label": titleText,
      tabindex: "-1",
    });

    var head = create("div", "anno-popover-head");
    var titleEl = create("h2", "anno-popover-title");
    titleEl.textContent = titleText;

    var close = create("button", "anno-popover-close", {
      type: "button",
      "aria-label": "Close annotation",
    });
    close.innerHTML = "&times;";

    var self = this;
    close.addEventListener("click", function (ev) {
      ev.preventDefault();
      ev.stopPropagation();
      self.close();
    });

    head.appendChild(titleEl);
    head.appendChild(close);

    var body = create("div", "anno-popover-body");
    body.innerHTML = entry.item.body || "";

    pop.appendChild(head);
    pop.appendChild(body);
    document.body.appendChild(pop);

    this._popover = pop;
    this._openIndex = index;
    this._activeMarker = entry.marker;
    entry.marker.classList.add("is-active");
    entry.marker.setAttribute("aria-expanded", "true");

    this._positionPopover(entry);
    pop.focus();
  };

  Controller.prototype._positionPopover = function (entry) {
    if (!this._popover || !entry) return;
    var pop = this._popover;
    var target = entry.target;
    var anchorRect =
      target && isVisible(target)
        ? target.getBoundingClientRect()
        : entry.marker
          ? entry.marker.getBoundingClientRect()
          : null;
    if (!anchorRect) return;

    // Ensure the popover is measurable before reading its size.
    pop.style.visibility = "hidden";
    pop.style.display = "block";
    var pw = pop.offsetWidth || 320;
    var ph = pop.offsetHeight || 120;
    pop.style.visibility = "";

    var vw = document.documentElement.clientWidth;
    var vh = document.documentElement.clientHeight;

    var left = anchorRect.left;
    // Prefer below the target; flip above when there's not enough room.
    var top = anchorRect.bottom + 10;
    if (top + ph > vh && anchorRect.top - ph - 10 > 0) {
      top = anchorRect.top - ph - 10;
    }
    if (left + pw > vw - 8) left = vw - pw - 8;
    if (left < 8) left = 8;
    if (top < 8) top = 8;

    pop.style.left = left + window.pageXOffset + "px";
    pop.style.top = top + window.pageYOffset + "px";
  };

  Controller.prototype.close = function () {
    if (!this._popover) return;
    var marker = this._activeMarker;
    if (this._popover.parentNode) this._popover.parentNode.removeChild(this._popover);
    this._popover = null;
    this._openIndex = -1;
    if (marker) {
      marker.classList.remove("is-active");
      marker.setAttribute("aria-expanded", "false");
      // Return focus to the marker that opened the dialog.
      if (typeof marker.focus === "function") marker.focus();
    }
    this._activeMarker = null;
  };

  // ── Reference highlight / scroll-to ────────────────────────────────────────
  Controller.prototype._highlight = function (entry) {
    if (entry.marker && this._visible) {
      var behavior = prefersReducedMotion() ? "auto" : "smooth";
      try {
        entry.marker.scrollIntoView({ behavior: behavior, block: "center", inline: "nearest" });
      } catch (e) {
        entry.marker.scrollIntoView();
      }
      entry.marker.classList.add("is-flash");
      var m = entry.marker;
      window.setTimeout(function () {
        m.classList.remove("is-flash");
      }, 1200);
      if (typeof entry.marker.focus === "function") entry.marker.focus();
    } else if (entry.target && isVisible(entry.target)) {
      try {
        entry.target.scrollIntoView({ block: "center" });
      } catch (e) {
        entry.target.scrollIntoView();
      }
    }
  };

  // ── Show / hide all markers ────────────────────────────────────────────────
  Controller.prototype.show = function () {
    this._visible = true;
    this._entries.forEach(function (entry) {
      if (entry.marker) entry.marker.style.display = "";
    });
    this._syncToggleLabel();
    this._reposition();
  };

  Controller.prototype.hide = function () {
    this._visible = false;
    this.close();
    this._entries.forEach(function (entry) {
      if (entry.marker) entry.marker.style.display = "none";
    });
    this._syncToggleLabel();
  };

  Controller.prototype.toggle = function () {
    if (this._visible) this.hide();
    else this.show();
  };

  // ── Event handlers ─────────────────────────────────────────────────────────
  Controller.prototype._onKeydown = function (ev) {
    if (ev.key === "Escape" && this._popover) {
      ev.preventDefault();
      this.close();
    }
  };

  Controller.prototype._onDocClick = function (ev) {
    if (!this._popover) return;
    var t = ev.target;
    if (this._popover.contains(t)) return;
    if (this._activeMarker && this._activeMarker.contains(t)) return;
    this.close();
  };

  Controller.prototype.destroy = function () {
    this._destroyed = true;
    this.close();
    window.removeEventListener("resize", this._boundReposition);
    window.removeEventListener("scroll", this._boundReposition);
    document.removeEventListener("keydown", this._boundKeydown, true);
    document.removeEventListener("click", this._boundDocClick, true);

    this._entries.forEach(function (entry) {
      if (entry.marker && entry.marker.parentNode) {
        entry.marker.parentNode.removeChild(entry.marker);
      }
    });
    if (this._referenceList && this._referenceList.parentNode) {
      this._referenceList.parentNode.removeChild(this._referenceList);
    }
    if (this._createdToggle && this._createdToggle.parentNode) {
      this._createdToggle.parentNode.removeChild(this._createdToggle);
    } else if (this._toggle && this._boundToggleClick) {
      this._toggle.removeEventListener("click", this._boundToggleClick);
    }
    this._entries = [];
  };

  var Annotations = {
    init: function (options) {
      return new Controller(options);
    },
  };

  global.Annotations = Annotations;
})(typeof window !== "undefined" ? window : this);
