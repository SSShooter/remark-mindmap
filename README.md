# remark-mindmap

Render `` ```mindelixir `` code blocks in Markdown as interactive [Mind Elixir](https://mind-elixir.com) mind maps — pan, zoom, collapse, full screen.

````md
```mindelixir
- How this works
  - Write a code block
    - Indentation is hierarchy
    - One node per line
  - The client renders it
    - Build step only emits a placeholder
```
````

Syntax is identical to the [`mindelixir` code block in the Obsidian plugin](https://github.com/SSShooter/obsidian-mindmap): indentation for nesting, `[^id]` for node ids, trailing JSON for node styles, `>-label->` for arrows, `- } text` for summaries. See [plaintext format](https://github.com/SSShooter/mind-elixir-core/blob/master/skills/plaintext-format/SKILL.md).

## Install

```bash
npm i remark-mindmap
```

`mind-elixir` is a direct dependency — you don't install it separately.

## Three entry points

The package ships three independent entries:

| Entry | Runs | Purpose |
| --- | --- | --- |
| `remark-mindmap` | Build time (Node) | remark plugin — swaps the code block for a placeholder |
| `remark-mindmap/client` | Browser | `mountMindMaps()` — renders the placeholders |
| `remark-mindmap/style.css` | — | Container styles |

They're split because the two runtimes are mutually exclusive: the client entry references `document`, the plugin entry walks an mdast tree. Bundling them together would drag `document` into your server bundle.

## Usage

### Astro

```js
// astro.config.mjs
import { defineConfig } from "astro/config";
import remarkMindElixir from "remark-mindmap";

export default defineConfig({
  markdown: {
    remarkPlugins: [remarkMindElixir],
  },
});
```

```astro
---
// src/layouts/BaseLayout.astro
import "remark-mindmap/style.css";
---
<html>
  <body>
    <slot />
    <script>
      import { mountMindMaps } from "remark-mindmap/client";
      void mountMindMaps();
    </script>
  </body>
</html>
```

### Any other remark pipeline

```js
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import rehypeStringify from "rehype-stringify";
import remarkMindElixir from "remark-mindmap";

const processor = unified()
  .use(remarkParse)
  .use(remarkMindElixir)
  .use(remarkRehype, { allowDangerousHtml: true })
  .use(rehypeStringify, { allowDangerousHtml: true });
```

Then, on the page:

```js
import { mountMindMaps } from "remark-mindmap/client";
import "remark-mindmap/style.css";

void mountMindMaps();
```

**The plugin must be a `remark` plugin, not a `rehype` one.** By the rehype stage the code block has already been consumed by Shiki / Expressive Code, and you'd only get an empty highlight box left behind.

## Options

### `remarkMindElixir(options)`

| Option | Default | Description |
| --- | --- | --- |
| `lang` | `"mindelixir"` | Code block language to look for |
| `height` | `460` | Container height in px. Per-block override via meta: ```` ```mindelixir height=560 ```` |
| `className` | `""` | Extra class on the container. Tailwind typography sites should pass `"not-prose"` |
| `wrapperClass` | `"mindmap"` | Container class; matches the rules in `style.css` |
| `sourceClass` | `"mindmap-source"` | Class of the `<pre>` holding the raw text |
| `dataAttribute` | `"mindmap"` | `data-*` attribute marking the container — keep in sync with the client's `selector` |

### `mountMindMaps(options)`

| Option | Default | Description |
| --- | --- | --- |
| `selector` | `"[data-mindmap]"` | Containers to render |
| `sourceSelector` | `".mindmap-source"` | Where the raw plaintext lives |
| `theme` | `"auto"` | `"auto"` \| `"light"` \| `"dark"` \| theme object \| `(ctx) => themeObject` |
| `detectTheme` | see below | Used when `theme: "auto"` |
| `minFitScale` | `0.6` | Auto-fit floor — see [Layout](#layout-and-auto-fit) |
| `direction` | `"right"` | `"right"` \| `"left"` |
| `toolbar` | `true` | Zoom / full screen toolbar |
| `inlineMarkdown` | built-in | `true` \| `false` \| `(text) => html` |
| `rootTopic` | `"Mind Map"` | Root node text when the plaintext has no single root |
| `transparentBackground` | `true` | Drop the map's own canvas colour |
| `observeTheme` | `true` | Re-theme on `data-theme` / class change |

Returns `Promise<MountedMindMap[]>` — each item exposes `{ element, mind, destroy() }`.

### Theme

`theme: "auto"` resolves the mode by checking, in order: `data-theme`, `data-mode`, `data-color-mode`, `data-color-scheme` on `<html>`; then `.dark` / `.theme-dark` classes; then `prefers-color-scheme`.

If your site uses something else, pass your own probe — no need to fight the default:

```js
void mountMindMaps({
  detectTheme: () => (localStorage.theme === "dark" ? "dark" : "light"),
});
```

## Styling

The accent colour is read from CSS, not from JS — so restyling needs no re-render, and changing it with a theme is automatic:

```css
.mindmap {
  --mde-accent: #e87a90;              /* centre node background */
  --mde-accent-foreground: #fff;      /* centre node text */
  --mde-loading-text: "加载中…";       /* placeholder before render */
}
```

Point it at your own design token:

```css
.mindmap {
  --mde-accent: hsl(var(--brand));
}
```

## Layout and auto-fit

An `direction: "right"` map is typically 800–950px wide. Article columns are usually ~600px, so **the map will be clipped by default** — a reader would only see the root and its first level.

So after `init()`, the width ratio is measured:

- Overflows **a little** (`ratio <= 1 / minFitScale`) → `scaleFit()`, everything visible. At `0.6` the text is still legible.
- Overflows **a lot** (narrow screens) → keeps its natural size and relies on drag / full screen, rather than shrinking into mush.

Tune with `minFitScale`: raise it (e.g. `0.8`) to allow more shrinking, lower it to shrink less often.

## Known behaviour

- **Nothing loads on pages without a mind map.** `mountMindMaps()` returns before importing anything when no container is found. Measured on a Vite production build: a page *with* a map requests exactly three extra files — `MindElixir.js` (87.6 kB), `PlaintextConverter.js` (5.5 kB), `MindElixir.css` (12.3 kB) — and a page *without* one requests none at all.

  How eagerly that CSS arrives depends on your bundler. Vite injects it alongside the chunk (as measured above). **Astro hoists it into a page-level `<link>`**, so there every post pays the ~12 kB (~3 kB gzipped) whether or not it contains a map. If that matters to you, import `mind-elixir/style.css` yourself via `?url` and inject a `<link>` at runtime — the trade-off is a flash of unstyled nodes.
- **The layout-switch toolbar is hidden.** mind-elixir's `toolBar: true` mounts two toolbars: `.rb` (zoom / full screen — useful to readers) and `.lt` (LHS / RHS / SIDE layout switch — an editing feature). There's no option to disable just one, so `style.css` hides `.lt`. Delete those three lines if you want it back.
- **Node text is plain text** unless `inlineMarkdown` is on (it is by default: `` `code` ``, `**bold**`, `[links](url)`). Single-asterisk italics are deliberately not supported — `2*3*4` would be mangled.

## License

MIT
