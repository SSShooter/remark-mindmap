import { escapeHtml } from "./utils.js";

/**
 * 让 ```mindelixir 代码块在构建时变成一张思维导图。
 *
 * **必须做成 remark 插件，不能是 rehype 插件。** 到了 rehype 阶段，代码块已经被
 * Shiki / Expressive Code 之类的插件接走并替换成高亮 DOM，这里只会留下一个空的高亮框。
 *
 * 插件本身只做一件事：把 `{type:"code", lang:"mindelixir"}` 原地换成一个空的占位容器，
 * 并把原文转义后塞进 `<pre hidden>`。真正的渲染在浏览器里由本包的 `./client` 入口完成。
 *
 * 原文放 `<pre>` 而不是 data 属性，是因为属性里的换行容易在各类处理链上被吃掉或改写。
 */

/**
 * mdast 的最小结构描述。
 *
 * 刻意不 import `mdast` / `unified` 的类型：那会和使用者项目里的版本产生类型冲突，
 * 而这个插件真正关心的字段只有四个。
 */
interface MdastNode {
  type: string;
  lang?: string | null;
  meta?: string | null;
  value?: string;
  children?: MdastNode[];
  [key: string]: unknown;
}

export interface RemarkMindElixirOptions {
  /** 识别的代码块语言，默认 `mindelixir` */
  lang?: string;
  /** 容器默认高度（px），代码块 meta 里写 `height=560` 可逐个覆盖 */
  height?: number;
  /**
   * 容器上的额外 class。Tailwind typography 站点传 `"not-prose"`，
   * 否则正文样式会渗进地图内部把节点排版搞乱。
   */
  className?: string;
  /** 容器 class，默认 `mindmap`，对应本包 `style.css` 里的规则 */
  wrapperClass?: string;
  /** 存原文的 `<pre>` 的 class，默认 `mindmap-source` */
  sourceClass?: string;
  /** 标记容器的 data 属性名，默认 `mindmap`。改动后要和客户端的 `selector` 对齐 */
  dataAttribute?: string;
}

const DEFAULTS = {
  lang: "mindelixir",
  height: 460,
  className: "",
  wrapperClass: "mindmap",
  sourceClass: "mindmap-source",
  dataAttribute: "mindmap",
};

function parseHeight(meta: unknown): number | undefined {
  const matched = /(?:^|\s)height=(\d+)/.exec(String(meta ?? ""));
  return matched?.[1] ? Number(matched[1]) : undefined;
}

export function remarkMindElixir(options: RemarkMindElixirOptions = {}) {
  const config = { ...DEFAULTS, ...options };
  const targetLang = config.lang.toLowerCase();
  const classes = [config.wrapperClass, config.className].filter(Boolean).join(" ");

  return function transform(tree: MdastNode): void {
    if (!tree || typeof tree !== "object") return;

    const walk = (node: MdastNode): void => {
      const children = node.children;
      if (!Array.isArray(children)) return;

      for (let index = 0; index < children.length; index += 1) {
        const child = children[index];
        if (!child) continue;

        if (
          child.type === "code" &&
          typeof child.lang === "string" &&
          child.lang.toLowerCase() === targetLang &&
          typeof child.value === "string"
        ) {
          const height = parseHeight(child.meta) ?? config.height;

          children[index] = {
            type: "html",
            value:
              `<div class="${classes}" data-${config.dataAttribute} style="height:${height}px">` +
              `<pre class="${config.sourceClass}" hidden>${escapeHtml(child.value)}</pre>` +
              `</div>`,
          } as MdastNode;

          // 已经换成别的节点了，不需要再往里走
          continue;
        }

        walk(child);
      }
    };

    walk(tree);
  };
}

export default remarkMindElixir;
