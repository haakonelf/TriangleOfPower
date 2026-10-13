const api = typeof browser !== "undefined" ? browser : chrome;
const NS = "http://www.w3.org/2000/svg";

/* ------------------------------------------------------------------ *
 *  Settings (editable on the options page)
 * ------------------------------------------------------------------ */
const DEFAULTS = {
  style: "graphic",   // simple expressions: "graphic" (SVG circles) | "unicode"
  nested: "drawing",  // nested expressions: "drawing" (triangle drawings) | "inline"
  plainLog: "none",   // what plain log(x) means: "none" (leave alone) | "10" | "e"
  enable: { log: true, ln: true, sqrt: true, root: true, power: true }
};
let cfg = JSON.parse(JSON.stringify(DEFAULTS));

function applySettings(s) {
  s = s || {};
  cfg = { ...DEFAULTS, ...s, enable: { ...DEFAULTS.enable, ...(s.enable || {}) } };
}

// Symbols for inline mode (also kept as hidden text for copy/paste).
const UNI = { log: "\u29CA", root: "\u2092\u25B3", power: "\u25B3\u2092" };

/* ------------------------------------------------------------------ *
 *  Parser
 *
 *  Node: { type: "log"|"root"|"power", a, b, src }
 *    log   : a = base,  b = argument      (log_a(b))
 *    root  : a = index, b = radicand      (b^(1/a), sqrt)
 *    power : a = base,  b = exponent      (a^b)
 *  Operand: { items: [string | Node, ...] }  or lazy { raw: "text", group: true }
 * ------------------------------------------------------------------ */
const isLetter = (c) => !!c && /\p{L}/u.test(c);
const isDigit = (c) => !!c && c >= "0" && c <= "9";
const isWord = (c) => isLetter(c) || isDigit(c) || c === "_";

const NUM_RE = /\d+(?:\.\d+)?/y;
const UND_RE = /(\d+|\p{L})/uy;
const BASE_RE = /([\u2080-\u2089]+|\d+)/uy;
const subToDigits = (t) => t.replace(/[\u2080-\u2089]/g, (ch) => String(ch.charCodeAt(0) - 0x2080));

function getItems(op) {
  if (!op.items) op.items = parseSeq(op.raw);
  return op.items;
}
const flat = (op) => getItems(op).map((x) => (typeof x === "string" ? x : x.src)).join("");
const needsParens = (op) => !!op.group && !/^[\p{L}\p{N}.]+$/u.test(flat(op));

function findClose(s, i) {
  const open = s[i], close = open === "(" ? ")" : "}";
  let d = 0;
  for (let j = i; j < s.length; j++) {
    if (s[j] === open) d++;
    else if (s[j] === close && --d === 0) return j;
  }
  return -1;
}

function groupAt(s, i) {
  const j = findClose(s, i);
  if (j < 0 || j === i + 1) return null;
  return { op: { raw: s.slice(i + 1, j), group: true }, end: j + 1 };
}

// Argument of a function: "(group)", or a bare atom / power without parentheses:
//   ln(7)  ln7  ln 7  ln x  ln x^2 (= ln(x^2))  ln ln x
function argAt(s, j) {
  while (s[j] === " ") j++;
  if (s[j] === "(") {
    const g = groupAt(s, j);
    return g ? { op: g.op, end: g.end } : null;
  }
  const t = tryOp(s, j, true);
  if (t) return { op: { items: [t.node] }, end: t.end };
  const a = parseAtom(s, j, true);
  return a ? { op: a.op, end: a.end } : null;
}

function tryFunc(s, i) {
  const prev = s[i - 1];
  if (isLetter(prev) || prev === "_") return null;
  let name = null;
  if (s.startsWith("sqrt", i)) name = "sqrt";
  else if (s.startsWith("log", i)) name = "log";
  else if (s.startsWith("ln", i)) name = "ln";
  if (!name || !cfg.enable[name]) return null;

  let j = i + name.length;
  let base = null;

  if (name === "log") {
    if (s[j] === "_") {                       // log_x(...), log_2 x, log_{..}(...), log_(..)(...)
      j++;
      if (s[j] === "(" || s[j] === "{") {
        const g = groupAt(s, j);
        if (!g) return null;
        base = g.op; j = g.end;
      } else {
        UND_RE.lastIndex = j;
        const m = UND_RE.exec(s);
        if (!m) return null;
        base = { items: [m[1]] }; j += m[0].length;
      }
    } else {
      BASE_RE.lastIndex = j;                  // log5(625), log5 625, log10(1000), log₂(8)
      const m = BASE_RE.exec(s);
      if (m) {
        base = { items: [subToDigits(m[1])] }; j += m[0].length;
      } else {                                // plain log(x): only with parentheses
        let k = j;
        while (s[k] === " ") k++;
        if (s[k] !== "(" || cfg.plainLog === "none") return null;
        base = { items: [cfg.plainLog] };
      }
    }
  }

  const arg = argAt(s, j);
  if (!arg) return null;
  const src = s.slice(i, arg.end);

  if (name === "log") return { node: { type: "log", a: base, b: arg.op, src }, end: arg.end };
  if (name === "ln")  return { node: { type: "log", a: { items: ["e"] }, b: arg.op, src }, end: arg.end };
  return { node: { type: "root", a: { items: ["2"] }, b: arg.op, src }, end: arg.end };
}

const ROOT_SIGNS = { "\u221A": "2", "\u221B": "3", "\u221C": "4" };   // √ ∛ ∜

function parseAtom(s, i, free) {
  const c = s[i];
  if (!c) return null;
  const prev = free ? "" : (i > 0 ? s[i - 1] : "");

  if (ROOT_SIGNS[c]) {                        // √2, √x, √(x+1)
    if (!cfg.enable.sqrt) return null;
    const arg = argAt(s, i + 1);
    if (!arg) return null;
    const node = { type: "root", a: { items: [ROOT_SIGNS[c]] }, b: arg.op, src: s.slice(i, arg.end) };
    return { op: { items: [node] }, end: arg.end, func: true };
  }
  if (c === "(" || c === "{") {
    if (isWord(prev) || prev === ")" || prev === "}" || prev === ".") return null; // f(x)^2 is left alone
    const g = groupAt(s, i);
    return g ? { op: g.op, end: g.end } : null;
  }
  if (isLetter(c)) {
    const f = tryFunc(s, i);
    if (f) return { op: { items: [f.node] }, end: f.end, func: true };
    if (isLetter(prev) || prev === "_" || prev === ".") return null;  // mid-word (digit before = coefficient, ok)
    if (isWord(s[i + 1])) return null;                               // multi-letter word
    return { op: { items: [c] }, end: i + 1 };
  }
  if (isDigit(c)) {
    if (isWord(prev) || prev === ".") return null;
    NUM_RE.lastIndex = i;
    const m = NUM_RE.exec(s);
    return m ? { op: { items: [m[0]] }, end: i + m[0].length } : null;
  }
  return null;
}

// length of a power operator at position k: "^" -> 1, "**" -> 2, else 0
const powLen = (s, k) => (s[k] === "^" ? 1 : s[k] === "*" && s[k + 1] === "*" ? 2 : 0);

function mkPower(base, exp, src) {
  if (exp.group && /^(st|nd|rd|th)$/i.test(exp.raw || "")) return null;   // 2nd, 3rd ...
  if (exp.group && exp.raw !== undefined && cfg.enable.root) {
    const m = /^\s*1\s*\/\s*(\S[\s\S]*?)\s*$/.exec(exp.raw);        // x^(1/n)  ->  root
    if (m) return { type: "root", a: { raw: m[1], group: true }, b: base, src };
  }
  if (!cfg.enable.power) return null;
  return { type: "power", a: base, b: exp, src };
}

// exponent: optional sign, atom, and right-associative chains (x^y^z = x^(y^z))
function parseExponent(s, j) {
  let sign = "";
  if (s[j] === "-" || s[j] === "+" || s[j] === "\u2212") { sign = s[j]; j++; }
  const a = parseAtom(s, j);
  if (!a) return null;
  let op = a.op, end = a.end;
  const pl = powLen(s, end);
  if (pl) {
    const e = parseExponent(s, end + pl);
    if (e) {
      const node = mkPower(a.op, e.op, s.slice(j, e.end));
      if (node) { op = { items: [node] }; end = e.end; }
    }
  }
  if (sign) {
    const inner = needsParens(op) ? ["(", ...getItems(op), ")"] : getItems(op);
    op = { items: [sign, ...inner] };
  }
  return { op, end };
}

function tryOp(s, i, free) {
  const a = parseAtom(s, i, free);
  if (!a) return null;
  const pl = powLen(s, a.end);
  if (pl) {
    const e = parseExponent(s, a.end + pl);
    if (e) {
      const node = mkPower(a.op, e.op, s.slice(i, e.end));
      if (node) return { node, end: e.end };
    }
  }
  if (a.func) return { node: a.op.items[0], end: a.end };
  return null;
}

function parseSeq(s) {
  const items = [];
  let buf = "";
  let i = 0;
  while (i < s.length) {
    const r = tryOp(s, i);
    if (r) {
      if (buf) { items.push(buf); buf = ""; }
      items.push(r.node);
      i = r.end;
    } else {
      buf += s[i];
      i++;
    }
  }
  if (buf) items.push(buf);
  return items;
}

/* ------------------------------------------------------------------ *
 *  Rendering
 * ------------------------------------------------------------------ */
const SLOTS = {
  log:   (n) => ({ left: n.a, right: n.b }),   // result is the (blank) top
  root:  (n) => ({ top: n.a, right: n.b }),    // result is the (blank) left
  power: (n) => ({ left: n.a, top: n.b })      // result is the (blank) right
};

const isNested = (n) => [n.a, n.b].some((o) => getItems(o).some((x) => typeof x === "object"));

function inlineOperand(op) {
  const frag = document.createDocumentFragment();
  const paren = needsParens(op);
  if (paren) frag.append("(");
  for (const it of getItems(op)) frag.append(typeof it === "string" ? it : inlineNode(it));
  if (paren) frag.append(")");
  return frag;
}

function inlineNode(node) {
  const wrap = document.createElement("span");
  wrap.className = "tp-wrap";
  wrap.title = node.src;
  const sym = document.createElement("span");
  sym.className = (cfg.style === "unicode" ? "tp-uni" : "tp-sym") + " tp-" + node.type;
  sym.textContent = UNI[node.type];
  wrap.append(inlineOperand(node.a), sym, inlineOperand(node.b));
  return wrap;
}

function svgEl(name, attrs) {
  const e = document.createElementNS(NS, name);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  return e;
}

function drawBox(node, depth) {
  const box = document.createElement("span");
  box.className = "tp-box tp-" + node.type + (depth ? "" : " tp-wrap");
  if (!depth) box.title = node.src;
  else box.style.fontSize = depth === 1 ? "0.5em" : "0.8em";

  const svg = svgEl("svg", { class: "tp-tri", viewBox: "0 0 60 52", preserveAspectRatio: "none", "aria-hidden": "true" });
  svg.append(svgEl("polygon", {
    points: "30,2.5 2.5,49.5 57.5,49.5", fill: "none", stroke: "currentColor",
    "stroke-width": "2.6", "stroke-linejoin": "round"
  }));
  box.append(svg);

  const slots = SLOTS[node.type](node);
  for (const pos of ["top", "left", "right"]) {
    const op = slots[pos];
    if (!op) continue;                                    // blank slot = the result
    const items = getItems(op);
    const only = items.length === 1 && typeof items[0] === "object" ? items[0] : null;
    const slot = document.createElement("span");
    if (only && depth < 3) {
      slot.className = `tp-slot tp-${pos} tp-boxslot`;
      slot.append(drawBox(only, depth + 1));              // nested drawing sits at the corner
      if (pos === "left") box.classList.add("tp-hl");
      if (pos === "right") box.classList.add("tp-hr");
    } else {
      slot.className = `tp-slot tp-${pos} tp-textslot`;
      for (const it of items) slot.append(typeof it === "string" ? it : inlineNode(it));
    }
    box.append(slot);
  }
  return box;
}

function renderTop(node) {
  return cfg.nested === "drawing" && isNested(node) ? drawBox(node, 0) : inlineNode(node);
}

const PREFILTER = /\^|\*\*|log|ln|sqrt|[\u221A\u221B\u221C]/;
const OBJ = "\uFFFC";   // placeholder for elements we don't look into

// Top-level scan: list of { text:true, from, to } and { node, from, to } segments.
function parseSegments(s) {
  const segs = [];
  let i = 0, tstart = 0;
  while (i < s.length) {
    const r = tryOp(s, i);
    if (r && !s.slice(i, r.end).includes(OBJ)) {
      if (i > tstart) segs.push({ text: true, from: tstart, to: i });
      segs.push({ node: r.node, from: i, to: r.end });
      i = r.end;
      tstart = i;
    } else {
      i++;
    }
  }
  if (tstart < s.length) segs.push({ text: true, from: tstart, to: s.length });
  return segs;
}

// Plain string -> DocumentFragment, or null if nothing matched.
function transform(text) {
  if (text.length > 20000 || !PREFILTER.test(text)) return null;
  const segs = parseSegments(text);
  if (!segs.some((x) => x.node)) return null;
  const frag = document.createDocumentFragment();
  for (const sg of segs) frag.append(sg.node ? renderTop(sg.node) : text.slice(sg.from, sg.to));
  return frag;
}

/* ------------------------------------------------------------------ *
 *  DOM plumbing
 * ------------------------------------------------------------------ */
const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEXTAREA", "INPUT"]);

function isSkippedEl(el) {
  return !el || SKIP_TAGS.has(el.tagName) || el.isContentEditable || el.closest(".tp-wrap, svg, math");
}
const shouldSkip = (node) => isSkippedEl(node.parentElement);

function processTextNode(node) {
  if (!node.isConnected || shouldSkip(node)) return;
  const frag = transform(node.nodeValue);
  if (frag) node.replaceWith(frag);
}

/* --- Expressions that use <sup> / <sub> ---------------------------------
 * A container's children are flattened into one string where
 *   <sup>x</sup> -> ^(x)     <sub>x</sub> -> _(x)     other elements -> OBJ
 * so  b<sup>log<sub>b</sub> x</sup>  becomes  b^(log_(b) x)  and
 *     log<sub>b</sub>(b<sup>x</sup>) becomes  log_(b)(b^(x)).
 * After parsing, only the DOM range that holds the recognised expressions is
 * rebuilt; everything else (and unrecognised <sup>/<sub>) stays as it was. */
function linearize(P) {
  const toks = [], spans = [];
  let s = "";
  const walk = (n) => {
    if (n.nodeType === 3) {
      toks.push({ k: "t", text: n.nodeValue, from: s.length, to: s.length + n.nodeValue.length });
      s += n.nodeValue;
      return;
    }
    const tag = n.nodeType === 1 ? n.tagName.toUpperCase() : "";
    if (tag === "SUP" || tag === "SUB") {
      toks.push({ k: "o", el: n, from: s.length, to: s.length + 2 });
      s += tag === "SUP" ? "^(" : "_(";
      Array.from(n.childNodes).forEach(walk);
      toks.push({ k: "c", el: n, from: s.length, to: s.length + 1 });
      s += ")";
    } else {
      toks.push({ k: "x", el: n, from: s.length, to: s.length + 1 });
      s += OBJ;
    }
  };
  for (const ch of Array.from(P.childNodes)) {
    const from = s.length;
    walk(ch);
    spans.push({ node: ch, from, to: s.length });
  }
  return { s, toks, spans };
}

// An expression may contain whole <sup>/<sub> elements, but must not cut one in half.
function validate(toks, ops) {
  for (const op of ops) {
    let bal = 0;
    for (const t of toks) {
      if (t.k === "t" || t.to <= op.from || t.from >= op.to) continue;
      if (t.from < op.from || t.to > op.to) return false;
      if (t.k === "o") bal++;
      else if (t.k === "c") { if (--bal < 0) return false; }
      else return false;
    }
    if (bal !== 0) return false;
  }
  return true;
}

function processSupContainer(P) {
  if (!P.isConnected || isSkippedEl(P)) return;
  const { s, toks, spans } = linearize(P);
  if (s.length > 20000 || !PREFILTER.test(s)) return;
  const segs = parseSegments(s);
  const ops = segs.filter((x) => x.node);
  if (!ops.length || !validate(toks, ops)) return;

  // DOM children that overlap the recognised expressions
  const first = ops[0], last = ops[ops.length - 1];
  const i0 = spans.findIndex((sp) => sp.to > first.from && sp.from < first.to);
  let i1 = -1;
  spans.forEach((sp, k) => { if (sp.to > last.from && sp.from < last.to) i1 = k; });
  if (i0 < 0 || i1 < i0) return;
  const lo = spans[i0].from, hi = spans[i1].to;
  const old = spans.slice(i0, i1 + 1).map((sp) => sp.node);
  const after = old[old.length - 1].nextSibling;

  const out = document.createDocumentFragment();
  const stack = [];
  const cur = () => (stack.length ? stack[stack.length - 1] : out);
  for (const sg of segs) {
    if (sg.to <= lo || sg.from >= hi) continue;
    if (sg.node) { cur().append(renderTop(sg.node)); continue; }
    const a = Math.max(sg.from, lo), b = Math.min(sg.to, hi);
    for (const t of toks) {
      if (t.to <= a || t.from >= b) continue;
      if (t.k === "t") {
        const x = t.text.slice(Math.max(a, t.from) - t.from, Math.min(b, t.to) - t.from);
        if (x) cur().append(x);
      } else if (t.k === "o") {          // keep the original <sup>/<sub> element
        t.el.replaceChildren();
        cur().append(t.el);
        stack.push(t.el);
      } else if (t.k === "c") {
        stack.pop();
      } else {
        cur().append(t.el);
      }
    }
  }
  for (const n of old) if (n.parentNode === P) P.removeChild(n);
  P.insertBefore(out, after);
}

function processTree(root) {
  if (!root || !root.isConnected) return;
  if (root.nodeType === 3) return processTextNode(root);
  if (root.nodeType !== 1) return;

  // 1) containers with <sup>/<sub> children, outer ones first
  const conts = new Set();
  root.querySelectorAll("sup, sub").forEach((el) => el.parentElement && conts.add(el.parentElement));
  if (/^(SUP|SUB)$/i.test(root.tagName) && root.parentElement) conts.add(root.parentElement);
  Array.from(conts)
    .sort((x, y) => (x === y ? 0 : x.compareDocumentPosition(y) & 4 ? -1 : 1))
    .forEach(processSupContainer);

  // 2) remaining plain text nodes
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  let n;
  while ((n = walker.nextNode())) nodes.push(n);
  nodes.forEach(processTextNode);
}

let pending = new Set();
let scheduled = false;
function schedule(node) {
  pending.add(node);
  if (scheduled) return;
  scheduled = true;
  setTimeout(() => {
    scheduled = false;
    const nodes = pending;
    pending = new Set();
    nodes.forEach(processTree);
  }, 100);
}

const observer = new MutationObserver((mutations) => {
  for (const m of mutations) {
    if (m.type === "characterData") schedule(m.target);
    else m.addedNodes.forEach((n) => schedule(n));
  }
});

async function init() {
  const stored = await api.storage.sync.get("settings");
  applySettings(stored.settings);
  if (!document.body) return;
  processTree(document.body);
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });
}

api.storage.onChanged.addListener((changes) => {
  if (changes.settings) {
    applySettings(changes.settings.newValue);
    if (document.body) processTree(document.body);
  }
});

init();
