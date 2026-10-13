# Triangle of Power Notation

A browser extension for **Firefox** and **Vivaldi** (any Chromium browser should work) that rewrites logarithms, roots and powers on web pages as **triangle-of-power** notation.

```
log_a(b)  →  a ⧊ b      circle above the triangle
a^(1/n)   →  n ○△ a     circle on the left
a^b       →  a △○ b     circle on the right
```
Expressions that contain other expressions are drawn as **nested triangles** instead of inline symbols.

For a simple explaination of the concept, see the following video by 3b1b: https://www.youtube.com/watch?v=sULa9Lc4pck

---

## The notation

A triangle has three corners: **top**, **bottom-left** and **bottom-right**. For `a^b = c` they hold the exponent, base and result:

| Corner | Holds |
|---|---|
| bottom-left | base `a` |
| top | exponent `b` |
| bottom-right | result `c` |

Each operation leaves one corner empty, the one you are solving for, and marks it with a circle:

| Operation | Written as | Meaning | Circle |
|---|---|---|---|
| log | `a ⧊ b` | log_a(b) | above |
| root | `a ○△ b` | b^(1/a) | left |
| power | `a △○ b` | a^b | right |

In a **nested drawing**, the empty (result) corner stays blank and a nested expression is drawn as a smaller triangle hanging off the corner it fills. For example, `log_x(x^(y))` is a log triangle with `x` on the left and a small power triangle at the right corner (`y` on top, `x` on its left). The same goes for `b^(log_b x)`: a power triangle with `b` on the left and a small log triangle on top.

---

## What gets converted

| Input | Result |
|---|---|
| `log_a(b)`, `log_a b`, `log_{a}(b)`, `log_(expr)(b)` | a ⧊ b |
| `log5(625)`, `log5 625`, `log10(1000)`, `log₂(8)` | base without underscore |
| `ln(x)`, `ln7`, `ln x` | e ⧊ x |
| `sqrt(x)`, `sqrt x`, `√x`, `√(x+1)` | 2 ○△ x |
| `∛x`, `∜x` | 3 ○△ x, 4 ○△ x |
| `x^(1/n)` | n ○△ x |
| `a^b`, `a**b`, `a^(b+1)`, `e^-x` | a △○ b |
| `b<sup>log<sub>b</sub> x</sup>` | HTML superscripts and subscripts work as `^(…)` and `_(…)` |

Details:

- **Arguments without parentheses** are a single number or letter: `ln7/ln2` becomes `e ⧊ 7 / e ⧊ 2`, and `ln a + ln b` becomes `e ⧊ a + e ⧊ b`.
- **`ln x^2`** is read as ln(x²), not (ln x)².
- **Plain `log(x)`** (no base) is left alone by default, because it is ambiguous. Choose base 10 or base e on the options page if you want it converted.
- **Operands with operators** keep their parentheses inline, such as `e ⧊ (a*b)`. Parentheses are dropped inside drawings.
- **Right-associative powers:** `2^3^4` is read as 2^(3^4).

### Deliberately left alone

To avoid mangling ordinary text, these are **not** converted:

- `f(x)^2` (a function call raised to a power)
- `cm^3`, `xy^2` and other multi-letter words
- `2<sup>nd</sup>`, `3<sup>rd</sup>` and similar ordinals
- `logic(x)`, `kiln 7` and other words that merely contain `log` or `ln`
- anything inside `<input>`, `<textarea>`, editable areas, `<script>`, `<style>`, `<svg>` and `<math>`

Single-letter bases are converted, so `m<sup>2</sup>` becomes `m △○ 2`. If that bothers you, turn off the "a^b as power" switch.

---

## Installation

### Vivaldi (or Chrome, Edge, Brave)

1. Unzip `triangle-of-power.zip`.
2. Open `vivaldi://extensions` and enable **Developer mode**.
3. Click **Load unpacked** and select the unzipped folder.

### Firefox (temporary)

1. Open `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on…** and pick `manifest.json` from the folder.

Temporary add-ons are removed when Firefox restarts. For a permanent install, either sign the extension through addons.mozilla.org (a private, unlisted submission is free), or use Firefox Developer Edition or Nightly with `xpinstall.signatures.required` set to `false` in `about:config`.

Requires Firefox 115 or newer. The extension uses Manifest V3.

---

## Settings

Open the extension's options page (`about:addons` → the extension → Preferences in Firefox, or the extension's details page in Vivaldi). All settings are stored with `storage.sync`.

| Setting | Options |
|---|---|
| What to convert | log, ln, sqrt/√, `x^(1/n)` as root, `a^b` as power (each on/off) |
| Plain `log(x)` means | leave alone, base 10, base e |
| Simple expressions | large circles (SVG) or plain Unicode (⧊ ₒ△ △ₒ) |
| Nested expressions | nested triangle drawings or inline symbols |

Reload open tabs after changing settings to see the effect on text that was already converted.

---

## Tips

- **Hover** over any converted expression to see the original text.
- **Copying:** inline symbols copy as Unicode characters (`⧊`, `ₒ△`, `△ₒ`). Nested drawings do not copy as text.
- **Plain Unicode mode** is the most copy-friendly, but the small circles come from your font's `ₒ` glyph.

---

## Customizing the look

The visual tuning values are in `content.css`:

| What | Where |
|---|---|
| Inline symbol size | `--tp-size` in `.tp-wrap` |
| Circle size and position on the inline symbols | the `<circle>` elements in the SVG data URIs of `.tp-sym.tp-log`, `.tp-root`, `.tp-power` (`cx`, `cy`, `r`) |
| Size of the main drawing | `width` / `height` of `.tp-box` |
| Space around a drawing | `margin` of `.tp-box` (extra room below keeps labels from being clipped) |
| How low the small triangle hangs at the corners | `bottom` on `.tp-boxslot.tp-left` and `.tp-boxslot.tp-right` |
| Gap between a top-slot child and the apex | `margin-bottom` on `.tp-slot.tp-top.tp-boxslot` |
| Label size on the small triangles | `font-size` on `.tp-box .tp-box .tp-textslot` |

In `content.js`:

- `DEFAULTS` holds the default settings.
- `UNI` holds the Unicode symbols used in inline mode.
- In `drawBox`, the child triangle size is the `fontSize` of `0.5em` for the first nesting level and `0.8em` for deeper levels. Drawings nest at most three levels deep, after which inner expressions fall back to inline symbols.

---

## Files

| File | Purpose |
|---|---|
| `manifest.json` | extension manifest (Manifest V3, `storage` permission only) |
| `content.js` | parser and renderer, runs on every page |
| `content.css` | symbol and drawing styles |
| `options.html`, `options.js` | settings page |

How it works: `content.js` scans text nodes, parses recognized expressions into a small tree (log / root / power nodes) and replaces them with either an inline symbol or a nested drawing. Paragraphs containing `<sup>` or `<sub>` are first flattened into a string like `b^(log_b x)`, parsed, and only the recognized part of the paragraph is rebuilt. A `MutationObserver` handles content added after page load.

No data leaves your browser. The extension makes no network requests and only uses `storage` for your settings.

---

## Known limitations

- **Math renderers** such as MathJax, KaTeX and MathML are skipped, because they split formulas into many tiny elements.
- **Drawings are taller than a line of text**, so they add spacing above and below. Some sites with fixed-height or `overflow: hidden` containers may clip the labels under a drawing.
- **Visual spacing is hand-tuned** and may need adjusting for fonts and sites that differ a lot (see "Customizing the look").
- **Very long text nodes** (over 20,000 characters) are skipped.
