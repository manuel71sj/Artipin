// 업로드 HTML 응답에 주입하는 브리지. 신뢰할 수 없는 HTML과 같은 문서에서 돈다.
// 소스에 닫는 script 태그 문자열, 백틱, 달러+중괄호를 넣지 않는다(템플릿 리터럴이 깨진다).
const BRIDGE = `(function () {
  var parent = window.parent;
  var mode = "browse";
  var pins = [];
  var drawn = [];
  var boxes = [];
  var pickedSel = null;
  var hoverEl = null;
  var MAX = 500;

  function uniqueId(el) {
    if (!el.id) return null;
    var esc = "#" + CSS.escape(el.id);
    try {
      return document.querySelectorAll(esc).length === 1 ? esc : null;
    } catch (e) {
      return null;
    }
  }

  function selectorOf(el) {
    var own = uniqueId(el);
    if (own) return own;
    var parts = [];
    var idAt = -1;
    var idSel = null;
    for (var n = el; n && n.nodeType === 1; n = n.parentElement) {
      if (idAt < 0) {
        idSel = uniqueId(n);
        if (idSel) idAt = parts.length;
      }
      if (n === document.documentElement) {
        parts.push("html");
      } else if (n === document.body) {
        parts.push("body");
      } else {
        var i = 1;
        for (var s = n.previousElementSibling; s; s = s.previousElementSibling) {
          if (s.tagName === n.tagName) i++;
        }
        parts.push(n.localName + ":nth-of-type(" + i + ")");
      }
    }
    var full = parts.slice().reverse().join(" > ");
    if (full.length <= MAX) return full;
    if (idAt >= 0) {
      var short = [idSel].concat(parts.slice(0, idAt).reverse()).join(" > ");
      if (short.length <= MAX) return short;
    }
    return null;
  }

  function clamp(v) {
    return Math.min(1, Math.max(0, v));
  }

  function find(selector) {
    try {
      return document.querySelector(selector);
    } catch (e) {
      return null;
    }
  }

  function addBox(el, color, style) {
    var r = el.getBoundingClientRect();
    var b = document.createElement("div");
    b.style.cssText =
      "position:absolute;z-index:2147483646;pointer-events:none;margin:0;padding:0;box-sizing:border-box;" +
      "border:2px " + style + " " + color + ";" +
      "left:" + (r.left + window.scrollX) + "px;top:" + (r.top + window.scrollY) + "px;" +
      "width:" + r.width + "px;height:" + r.height + "px;";
    document.documentElement.appendChild(b);
    boxes.push(b);
  }

  function paint() {
    boxes.forEach(function (b) {
      b.remove();
    });
    boxes = [];
    if (mode !== "comment") return;
    pins.forEach(function (p) {
      var el = find(p.selector);
      if (el) addBox(el, p.resolved ? "#475569" : "#c93036", "solid");
    });
    var picked = pickedSel ? find(pickedSel) : null;
    if (picked) addBox(picked, "#2563eb", "solid");
    if (hoverEl && hoverEl !== picked) addBox(hoverEl, "#2563eb", "dashed");
  }

  function pinOf(t) {
    for (var i = 0; i < drawn.length; i++) {
      if (drawn[i].el === t) return drawn[i];
    }
    return null;
  }

  function onClick(e) {
    var hit = pinOf(e.target);
    if (hit) {
      e.preventDefault();
      e.stopPropagation();
      var pr = hit.el.getBoundingClientRect();
      parent.postMessage(
        {
          type: "pin-click",
          id: hit.id,
          x: pr.left + pr.width / 2,
          y: pr.top + pr.height / 2,
        },
        "*"
      );
      return;
    }
    parent.postMessage({ type: "pin-close" }, "*");
    if (mode !== "comment") return;
    e.preventDefault();
    e.stopPropagation();
    var el = e.target;
    if (!el || el.nodeType !== 1) return;
    var selector = selectorOf(el);
    if (!selector) return;
    var r = el.getBoundingClientRect();
    parent.postMessage(
      {
        type: "anchor-picked",
        selector: selector,
        relX: r.width > 0 ? clamp((e.clientX - r.left) / r.width) : 0,
        relY: r.height > 0 ? clamp((e.clientY - r.top) / r.height) : 0,
      },
      "*"
    );
  }

  function draw() {
    drawn.forEach(function (d) {
      d.el.remove();
    });
    drawn = [];
    pins.forEach(function (p) {
      var el = find(p.selector);
      if (!el) return;
      var r = el.getBoundingClientRect();
      var d = document.createElement("div");
      d.textContent = String(p.n);
      d.style.cssText =
        "position:absolute;z-index:2147483647;pointer-events:auto;cursor:pointer;margin:0;padding:0;" +
        "box-sizing:border-box;width:24px;height:24px;border-radius:50%;background:" + (p.resolved ? "#475569" : "#c93036") + ";" +
        "color:#fff;font:12px/24px Arial,sans-serif;text-align:center;" +
        "transform:translate(-50%,-50%);font-weight:700;" +
        "left:" + (r.left + window.scrollX + p.relX * r.width) + "px;" +
        "top:" + (r.top + window.scrollY + p.relY * r.height) + "px;";
      document.documentElement.appendChild(d);
      drawn.push({ el: d, id: p.id });
    });
    paint();
  }

  function validPins(a) {
    return (
      Array.isArray(a) &&
      a.every(function (p) {
        return (
          p &&
          typeof p === "object" &&
          typeof p.id === "number" &&
          typeof p.n === "number" &&
          typeof p.selector === "string" &&
          typeof p.relX === "number" &&
          typeof p.relY === "number" &&
          typeof p.resolved === "boolean"
        );
      })
    );
  }

  window.addEventListener("message", function (e) {
    if (e.source !== parent) return;
    var d = e.data;
    if (!d || typeof d !== "object") return;
    if (d.type === "mode") {
      if (d.mode === "browse" || d.mode === "comment") mode = d.mode;
      if (mode !== "comment") {
        pickedSel = null;
        hoverEl = null;
      }
      paint();
    } else if (d.type === "pending") {
      if (d.selector !== null && typeof d.selector !== "string") return;
      pickedSel = d.selector;
      paint();
    } else if (d.type === "render-pins") {
      if (!validPins(d.pins)) return;
      pins = d.pins;
      draw();
    } else if (d.type === "scroll-to-pin") {
      var hit = drawn.filter(function (x) {
        return x.id === d.id;
      })[0];
      if (hit) hit.el.scrollIntoView({ block: "center", inline: "center" });
    }
  });
  window.addEventListener("click", onClick, true);
  window.addEventListener("mouseover", function (e) {
    var t = e.target;
    hoverEl = t && t.nodeType === 1 && !pinOf(t) ? t : null;
    if (mode === "comment") paint();
  }, true);
  document.documentElement.addEventListener("mouseleave", function () {
    hoverEl = null;
    if (mode === "comment") paint();
  });
  window.addEventListener("scroll", function () {
    parent.postMessage({ type: "pin-close" }, "*");
  }, true);
  window.addEventListener("keydown", function (e) {
    if (e.key === "Escape") parent.postMessage({ type: "pin-close" }, "*");
  });
  window.addEventListener("resize", draw);
  window.addEventListener("load", draw);
  parent.postMessage({ type: "bridge-ready" }, "*");
})();`;

const BRIDGE_TAG = `<script>${BRIDGE}</script>`;

/** HTML 응답에 브리지를 단순 삽입한다. 마지막 body 닫는 태그 직전, 없으면 문서 끝. */
export function injectBridge(html: string): string {
  let at = html.length;
  for (const m of html.matchAll(/<\/body\s*>/gi)) at = m.index;
  return html.slice(0, at) + BRIDGE_TAG + html.slice(at);
}
