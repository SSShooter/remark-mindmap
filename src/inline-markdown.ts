import { escapeHtml } from "./utils.js";

/**
 * 节点文字的行内 markdown。
 *
 * 刻意只支持三种：`代码`、**粗体**、[链接](url)。
 * 不支持单星号斜体 —— `2*3*4`、`a*b*c` 这类内容会被误伤，
 * 而节点的文字通常很短，收益远小于风险。
 *
 * 先转义再替换，所以节点里写 `<script>` 出来是纯文本。
 */

export type InlineMarkdownOption = boolean | ((text: string) => string);

export function createInlineMarkdown(): (text: string) => string {
  return function renderInlineMarkdown(text) {
    return escapeHtml(text)
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(
        /\[([^\]]+)\]\(([^)\s]+)\)/g,
        '<a href="$2" target="_blank" rel="nofollow noopener noreferrer">$1</a>',
      );
  };
}
