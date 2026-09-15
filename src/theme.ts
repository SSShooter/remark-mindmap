import type { Theme } from "mind-elixir";

export type { Theme as MindElixirTheme };

/**
 * 主题解析。
 *
 * 这个包不假设宿主的换肤方式：默认探测只是尽力而为（data-* 属性 / class / 系统偏好），
 * 站点用别的方案就传 `detectTheme`，或者直接传固定主题。
 *
 * 视觉值一律优先从 CSS 变量读（`--mde-accent` 等），而不是从 JS 参数读 ——
 * 这样站点换肤时不需要重新调用任何 API，浏览器自己就把颜色更新了。
 */

export type ThemeMode = "light" | "dark";

/**
 * 主题输入：允许只覆盖一部分字段，缺的用内建主题兜底。
 * 所以 `theme: { cssVar: { "--bgcolor": "transparent" } }` 是合法的，
 * 不需要把 name / palette 也抄一遍。
 */
export interface ThemeInput {
  name?: string;
  type?: "light" | "dark";
  palette?: string[];
  cssVar?: Record<string, string>;
  [key: string]: unknown;
}

export interface ThemeContext {
  mode: ThemeMode;
  /** 当前地图容器，可用来读取站点自己的 CSS 变量 */
  element: HTMLElement;
  /** mind-elixir 模块本体，可用来取内建的 THEME / DARK_THEME */
  mindElixir: typeof import("mind-elixir");
}

export type ThemeOption =
  | ThemeMode
  | "auto"
  | ThemeInput
  | ((context: ThemeContext) => ThemeInput);

/** 会被用来判断明暗的根元素属性，覆盖常见的几套约定 */
const MODE_ATTRIBUTES = ["data-theme", "data-mode", "data-color-mode", "data-color-scheme"];

const DARK_CLASSES = ["dark", "theme-dark"];

/**
 * 默认的明暗探测：先看根元素属性，再看 class，最后回落到系统偏好。
 * `theme: "auto"` 时用它；给了固定主题或自定义函数时不会被调用。
 */
export function detectThemeMode(): ThemeMode {
  if (typeof document === "undefined") return "light";
  const root = document.documentElement;

  for (const attribute of MODE_ATTRIBUTES) {
    const value = root.getAttribute(attribute)?.toLowerCase();
    if (value === "dark") return "dark";
    if (value === "light") return "light";
  }

  if (DARK_CLASSES.some((name) => root.classList.contains(name))) return "dark";

  if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }

  return "light";
}

function readCssVar(element: HTMLElement, name: string): string {
  return getComputedStyle(element).getPropertyValue(name).trim();
}

/**
 * 把部分主题补全成 mind-elixir 要求的完整结构。
 * `as Theme` 收口在这里：ThemeInput 允许索引任意字段和省略 name / palette，
 * 而 Theme 是严格结构，两者在类型上无法自动收敛。
 */
function toCompleteTheme(input: ThemeInput, fallback: Theme): Theme {
  const cssVar = { ...fallback.cssVar, ...input.cssVar } as Theme["cssVar"];

  return {
    ...fallback,
    ...input,
    name: input.name ?? fallback.name,
    palette: input.palette ?? fallback.palette,
    cssVar,
  } as Theme;
}

export interface ResolveThemeContext {
  element: HTMLElement;
  theme: ThemeOption;
  detectTheme: () => ThemeMode;
  mindElixir: typeof import("mind-elixir");
  transparentBackground: boolean;
}

export function resolveTheme({
  element,
  theme,
  detectTheme,
  mindElixir,
  transparentBackground,
}: ResolveThemeContext): Theme {
  const mode = detectTheme();

  let base: ThemeInput;
  let fallback: Theme;

  if (typeof theme === "function") {
    base = theme({ mode, element, mindElixir });
    fallback = mode === "dark" ? (mindElixir.DARK_THEME as Theme) : (mindElixir.THEME as Theme);
  } else if (typeof theme === "object" && theme !== null) {
    base = theme;
    fallback = mode === "dark" ? (mindElixir.DARK_THEME as Theme) : (mindElixir.THEME as Theme);
  } else {
    const wanted = theme === "auto" ? mode : theme;
    base = {};
    fallback = wanted === "dark" ? (mindElixir.DARK_THEME as Theme) : (mindElixir.THEME as Theme);
  }

  const resolved = toCompleteTheme(base, fallback);
  const cssVar = { ...resolved.cssVar } as Record<string, string>;

  // 地图直接落在站点背景上，不额外铺一层画布色
  if (transparentBackground) cssVar["--bgcolor"] = "transparent";

  // 中心节点跟站点主色走。站点在 CSS 里写 --mde-accent 即可，
  // 值可以是任意颜色（想对接自己的变量就写 hsl(var(--brand)) 之类）。
  const accent = readCssVar(element, "--mde-accent");
  if (accent) {
    cssVar["--root-bgcolor"] = accent;
    cssVar["--root-color"] = readCssVar(element, "--mde-accent-foreground") || "#ffffff";
  }

  return { ...resolved, cssVar } as Theme;
}

/**
 * 监听根元素的换肤信号，只在明暗真的变了才回调。
 * 返回取消监听的函数。
 */
export function watchThemeMode(onChange: () => void): () => void {
  if (typeof MutationObserver === "undefined" || typeof document === "undefined") {
    return () => {};
  }

  let last = detectThemeMode();
  const observer = new MutationObserver(() => {
    const next = detectThemeMode();
    if (next === last) return;
    last = next;
    onChange();
  });

  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: [...MODE_ATTRIBUTES, "class"],
  });

  return () => observer.disconnect();
}
