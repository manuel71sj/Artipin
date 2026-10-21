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
  var skipClick = false;
  var styled = false;
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
      if (el) addBox(el, p.resolved ? "#2a7a57" : "#d92d27", "solid");
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

  // 드래그 선택을 선택 앵커로 보낸다. 뒤따르는 click이 요소 핀을 또 만들지 않게 skipClick을 세운다.
  function onMouseUp() {
    if (mode !== "comment") return;
    var sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) return;
    var range = sel.getRangeAt(0);
    var quote = range.toString().replace(/\\s+/g, " ").trim().slice(0, 300);
    if (!quote) return;
    var el = range.commonAncestorContainer;
    if (el.nodeType !== 1) el = el.parentElement;
    if (!el) return;
    var selector = selectorOf(el);
    if (!selector) return;
    var r0 = range.getClientRects()[0] || range.getBoundingClientRect();
    var er = el.getBoundingClientRect();
    skipClick = true;
    parent.postMessage(
      {
        type: "anchor-picked",
        selector: selector,
        relX: er.width > 0 ? clamp((r0.left - er.left) / er.width) : 0,
        relY: er.height > 0 ? clamp((r0.top - er.top) / er.height) : 0,
        quote: quote,
        x: r0.left,
        y: r0.top,
      },
      "*"
    );
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
    if (mode !== "comment") {
      parent.postMessage({ type: "pin-close" }, "*");
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    if (skipClick) {
      skipClick = false;
      return;
    }
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
        x: e.clientX,
        y: e.clientY,
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
        "box-sizing:border-box;width:22px;height:22px;border:2px solid #fff;border-radius:50%;background:" + (p.resolved ? "#2a7a57" : "#d92d27") + ";" +
        "color:#fff;font:600 11.5px/18px Arial,sans-serif;text-align:center;" +
        "transform:translate(-50%,-50%);" +
        "left:" + (r.left + window.scrollX + p.relX * r.width) + "px;" +
        "top:" + (r.top + window.scrollY + p.relY * r.height) + "px;";
      document.documentElement.appendChild(d);
      drawn.push({ el: d, id: p.id });
    });
    paint();
    highlight();
  }

  // 요소 안 텍스트를 공백 묶음 한 칸으로 줄여 가며 문자마다 fn(문자, 텍스트 노드, 오프셋)을 부른다. fn이 true를 돌려주면 멈춘다.
  function walkText(root, fn) {
    var w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    var prevSpace = false;
    for (var n = w.nextNode(); n; n = w.nextNode()) {
      var t = n.data;
      for (var i = 0; i < t.length; i++) {
        var sp = /\\s/.test(t.charAt(i));
        if (sp && prevSpace) continue;
        prevSpace = sp;
        if (fn(sp ? " " : t.charAt(i), n, i)) return;
      }
    }
  }

  // 요소 안에서 인용문의 첫 일치를 Range로 돌려준다. 없으면 null.
  function quoteRange(el, quote) {
    var norm = "";
    walkText(el, function (ch) {
      norm += ch;
    });
    var at = norm.indexOf(quote);
    if (at < 0) return null;
    var range = document.createRange();
    var k = 0;
    walkText(el, function (ch, n, i) {
      if (k === at) range.setStart(n, i);
      if (k === at + quote.length - 1) {
        range.setEnd(n, i + 1);
        return true;
      }
      k++;
      return false;
    });
    return range;
  }

  // 인용문을 CSS Custom Highlight로 칠한다. DOM은 건드리지 않고, 못 찾은 핀은 요소 핀만 남긴다.
  function highlight() {
    if (!styled) {
      var st = document.createElement("style");
      st.textContent = "::highlight(artipin-quote){background-color:rgba(255,200,0,.45)}";
      document.documentElement.appendChild(st);
      styled = true;
    }
    var h = new Highlight();
    pins.forEach(function (p) {
      if (!p.quote) return;
      var el = find(p.selector);
      var r = el ? quoteRange(el, p.quote) : null;
      if (r) h.add(r);
    });
    CSS.highlights.set("artipin-quote", h);
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
          typeof p.resolved === "boolean" &&
          (p.quote === undefined || typeof p.quote === "string")
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
  window.addEventListener("mousedown", function () {
    skipClick = false;
  }, true);
  window.addEventListener("mouseup", onMouseUp, true);
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
