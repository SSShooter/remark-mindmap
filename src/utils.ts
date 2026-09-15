const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
};

/** HTML 文本节点的最小转义：只要不进属性、不用引号，这三个就够了 */
export function escapeHtml(text: string): string {
  return text.replace(/[&<>]/g, (char) => ESCAPES[char] ?? char);
}

/** 放进双引号属性值里的转义 —— 比 `escapeHtml` 多一个引号，
 * 否则节点文字里一个 `"` 就能把 `aria-label` 提前闭合掉 */
export function escapeAttribute(text: string): string {
  return escapeHtml(text).replace(/"/g, "&quot;");
}
