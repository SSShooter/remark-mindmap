const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
};

/** HTML 文本节点的最小转义：只要不进属性、不用引号，这三个就够了 */
export function escapeHtml(text: string): string {
  return text.replace(/[&<>]/g, (char) => ESCAPES[char] ?? char);
}
