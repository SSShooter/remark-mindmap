import { createInlineMarkdown, type InlineMarkdownOption } from "./inline-markdown.js";
import {
  detectThemeMode,
  resolveTheme,
  watchThemeMode,
  type ThemeMode,
  type ThemeOption,
} from "./theme.js";

/**
 * 把 remark 插件写下的占位容器渲染成 Mind Elixir 思维导图。
 *
 * 用法：在页面脚本里 `mountMindMaps()`。没找到容器就直接返回，
 * 所以没有思维导图的页面不会加载 mind-elixir。
 */

type MindElixirModule = typeof import("mind-elixir");
type MindElixirInstance = InstanceType<MindElixirModule["default"]>;

export interface MountMindMapsOptions {
  /** 要找的容器，默认 `[data-mindmap]` */
  selector?: string;
  /** 容器里存原文的元素，默认 `.mindmap-source` */
  sourceSelector?: string;
  /**
   * `"auto"`（默认，跟随明暗探测）、固定 `"light"`/`"dark"`、
   * 直接给一个主题对象，或给一个返回主题对象的函数。
   */
  theme?: ThemeOption;
  /** `theme: "auto"` 时的明暗探测方式，默认看 `data-theme` / class / 系统偏好 */
  detectTheme?: () => ThemeMode;
  /**
   * 自动缩放到全可见的下限，默认 `0.6`。
   * 地图只比容器大一点点时会缩到刚好放下；超出这个比例就保持原尺寸，交给读者拖拽和全屏 ——
   * 否在窄屏上会缩成一团糊字。
   */
  minFitScale?: number;
  /** 展开方向，默认 `"right"` */
  direction?: "right" | "left";
  /** 是否显示缩放 / 全屏工具栏，默认 `true` */
  toolbar?: boolean;
  /** 节点文字的行内 markdown，默认开启内建的精简版；传 `false` 关闭，或传自己的函数 */
  inlineMarkdown?: InlineMarkdownOption;
  /** plaintext 没有中心主题时用的根节点文字，默认 `"Mind Map"` */
  rootTopic?: string;
  /** 把画布底色设为透明，让地图落在站点背景上，默认 `true` */
  transparentBackground?: boolean;
  /** 跟随根元素换肤（仅 `theme: "auto"` 时有意义），默认 `true` */
  observeTheme?: boolean;
}

export interface MountedMindMap {
  element: HTMLElement;
  mind: MindElixirInstance;
  /**
   * 销毁实例并摘掉就绪标记。
   * 注意销毁后的实例不可复用（mind-elixir 会清掉 DOM 基建），要重新挂载请再调一次 `mountMindMaps`。
   */
  destroy(): void;
}

const DEFAULTS = {
  selector: "[data-mindmap]",
  sourceSelector: ".mindmap-source",
  theme: "auto" as ThemeOption,
  minFitScale: 0.6,
  direction: "right" as const,
  toolbar: true,
  rootTopic: "Mind Map",
  transparentBackground: true,
  observeTheme: true,
};

/** 溢出一点点就缩到全部可见，溢出太多则保持原尺寸 */
function fitToContainer(mind: MindElixirInstance, minFitScale: number): void {
  const { container, nodes } = mind;
  if (!container?.offsetWidth || !container.offsetHeight || !nodes?.offsetWidth) return;

  const ratio = Math.max(
    nodes.offsetWidth / container.offsetWidth,
    nodes.offsetHeight / container.offsetHeight,
  );

  if (ratio > 1 && ratio <= 1 / minFitScale) mind.scaleFit();
}

export async function mountMindMaps(
  options: MountMindMapsOptions = {},
): Promise<MountedMindMap[]> {
  if (typeof document === "undefined") return [];

  const config = { ...DEFAULTS, ...options };
  const elements = Array.from(document.querySelectorAll<HTMLElement>(config.selector));

  // 页面里没有思维导图：到此为止，一个字节都不多加载
  if (elements.length === 0) return [];

  const detectTheme = config.detectTheme ?? detectThemeMode;

  const [mindElixir, { plaintextToMindElixir }] = await Promise.all([
    import("mind-elixir"),
    import("mind-elixir/plaintextConverter"),
    // 样式也在这里引。宿主的打包器（Vite / webpack）会把它提成页面级样式表，
    // 意思是：JS 是懒的，但一旦页面里有地图，这份 CSS 就会跟着该页面加载。
    // 想彻底控制它，就自己在仓库里引 mind-elixir/style.css，并把这个包换成本地导入。
    import("mind-elixir/style.css"),
  ]);

  const MindElixir = mindElixir.default;

  const renderMarkdown =
    config.inlineMarkdown === false
      ? undefined
      : typeof config.inlineMarkdown === "function"
        ? config.inlineMarkdown
        : createInlineMarkdown();

  const themeFor = (element: HTMLElement) =>
    resolveTheme({
      element,
      theme: config.theme,
      detectTheme,
      mindElixir,
      transparentBackground: config.transparentBackground,
    });

  const mounted = await Promise.all(
    elements.map(async (element): Promise<MountedMindMap | undefined> => {
      const source = element.querySelector(config.sourceSelector)?.textContent ?? "";
      if (!source.trim()) return undefined;

      let data: ReturnType<typeof plaintextToMindElixir>;
      try {
        data = plaintextToMindElixir(source, config.rootTopic);
      } catch (error) {
        console.error("[remark-mindmap] plaintext 解析失败：", error);
        return undefined;
      }

      const mind = new MindElixir({
        el: element,
        direction: config.direction === "left" ? MindElixir.LEFT : MindElixir.RIGHT,
        editable: false,
        contextMenu: false,
        keypress: false,
        toolBar: config.toolbar,
        theme: themeFor(element),
        ...(renderMarkdown ? { markdown: renderMarkdown } : {}),
      });

      const error = await mind.init(data);
      if (error) {
        console.error("[remark-mindmap] 渲染失败：", error);
        return undefined;
      }

      fitToContainer(mind, config.minFitScale);
      element.dataset.mindmapReady = "";

      return {
        element,
        mind,
        destroy() {
          mind.destroy();
          delete element.dataset.mindmapReady;
        },
      };
    }),
  );

  const result = mounted.filter((item): item is MountedMindMap => item !== undefined);

  // 站点切换明暗时同步地图主题。只有 auto 模式需要跟，
  // 固定主题和自定义主题函数的结果不随明暗变化。
  if (config.observeTheme && config.theme === "auto") {
    watchThemeMode(() => {
      for (const { element, mind } of result) mind.changeTheme(themeFor(element));
    });
  }

  return result;
}

export { createInlineMarkdown, detectThemeMode };
export type { InlineMarkdownOption, ThemeMode, ThemeOption };
export type { MindElixirTheme, ThemeContext, ThemeInput } from "./theme.js";
export default mountMindMaps;
