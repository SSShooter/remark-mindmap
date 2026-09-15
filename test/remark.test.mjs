import assert from "node:assert/strict";
import { test } from "node:test";

import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import rehypeStringify from "rehype-stringify";

// 关键：这里 import 的是包自己的 name，走的是 package.json 的 exports，
// 也就是发布出去的那份产物 —— 测试验证的是 dist，不是 src。
import { remarkMindmap } from "remark-mindmap";
import { createInlineMarkdown, detectThemeMode, mountMindMaps } from "remark-mindmap/client";

const render = async (markdown, pluginOptions) => {
  const processor = unified().use(remarkParse);
  if (pluginOptions === undefined) processor.use(remarkMindmap);
  else processor.use(remarkMindmap, pluginOptions);

  return String(
    await processor
      .use(remarkRehype, { allowDangerousHtml: true })
      .use(rehypeStringify, { allowDangerousHtml: true })
      .process(markdown),
  );
};

test("exports 的每个入口都可解析", () => {
  assert.equal(typeof remarkMindmap, "function");
  assert.equal(typeof mountMindMaps, "function");
  assert.equal(typeof detectThemeMode, "function");
  assert.equal(typeof createInlineMarkdown, "function");
});

test("Node 环境下的主题探测降级为 light，不访问 DOM", () => {
  assert.equal(detectThemeMode(), "light");
});

test("无容器时 mountMindMaps 直接返回空数组", async () => {
  assert.deepEqual(await mountMindMaps(), []);
});

test("代码块被替换成占位容器，原文进隐藏的 pre", async () => {
  const html = await render("```mindelixir\n- 根\n  - 子\n```\n");

  assert.ok(html.includes("data-mindmap"));
  assert.ok(html.includes('class="mindmap"'));
  assert.ok(html.includes('<pre class="mindmap-source" hidden>'));
  assert.ok(html.includes("height:460px"), "默认高度");
  // 代码块本身不该留下任何痕迹
  assert.ok(!html.includes("<code class="));
});

test("meta 里的 height= 覆盖默认高度，className 会追加", async () => {
  const html = await render("```mindelixir height=560\n- 根\n```\n", {
    className: "not-prose",
  });

  assert.ok(html.includes("height:560px"));
  assert.ok(html.includes('class="mindmap not-prose"'), html.match(/<div[^>]*>/)?.[0]);
});

test("原文里的 HTML 被转义，不会注入", async () => {
  const html = await render("```mindelixir\n- 用 <b> 测试\n```\n");

  assert.ok(html.includes("&lt;b&gt;"));
  assert.ok(!html.includes("<b> 测试"));
});

test("lang 选项生效：不匹配的代码块原样保留", async () => {
  const html = await render("```mindelixir\n- 不该被处理\n```\n", { lang: "mindmap" });

  assert.ok(html.includes("<code"));
  assert.ok(!html.includes("data-mindmap"));
});

test("非 mindelixir 的代码块不受影响", async () => {
  const html = await render("```js\nconst a = 1;\n```\n");

  assert.ok(html.includes("<code"));
  assert.ok(!html.includes("data-mindmap"));
});

test("正文的其余部分不受影响", async () => {
  const html = await render("# 标题\n\n```mindelixir\n- 根\n```\n\n后面一段。\n");

  assert.ok(html.includes("标题"));
  assert.ok(html.includes("后面一段。"));
});

const SAMPLE = [
  "```mindelixir",
  "- 产品研发流程",
  "  - 调研阶段 [^research]",
  "    - 用户访谈",
  "    - 竞品分析",
  "    - }:2 调研总结",
  "  - 开发阶段 [^dev]",
  "    - 架构设计",
  "    - > [^research] >-进入-> [^dev]",
  "```",
  "",
].join("\n");

test("层次被编译成语义化列表，且放在画布外面", async () => {
  const html = await render(SAMPLE);

  assert.ok(html.includes('role="img" aria-label="产品研发流程"'), html.match(/<div[^>]*>/)?.[0]);
  assert.ok(html.includes('class="mindmap-a11y" data-mindmap-a11y'));

  // 三层缩进 → 三层嵌套列表
  assert.ok(html.includes("<li>调研阶段<ul>"), html);
  assert.ok(html.includes("<li>用户访谈</li>"));
  assert.ok(html.includes("<li>架构设计</li>"));

  // 画布的清空行为会连列表一起抹掉，所以列表必须在画布闭合标签之后
  const canvasEnd = html.indexOf("</pre></div>");
  assert.ok(canvasEnd < html.indexOf('data-mindmap-a11y'), "列表必须跟在画布之后");
});

test("概要与连线不会丢，且连线另起一棵列表", async () => {
  const html = await render(SAMPLE);

  assert.ok(html.includes("<li>调研总结</li>"), "概要文字要保留");
  assert.ok(html.includes("<li>调研阶段 → 开发阶段（进入）</li>"), html);
});

test("节点文字里的 HTML 与引号都被转义", async () => {
  const html = await render('```mindelixir\n- 说 "引号" <script>\n```\n');

  assert.ok(html.includes('aria-label="说 &quot;引号&quot; &lt;script&gt;"'));
  assert.ok(!html.includes("<script>"));
});

test("a11y: false 时既不产出列表也不加 role", async () => {
  const html = await render("```mindelixir\n- 根\n  - 子\n```\n", { a11y: false });

  assert.ok(!html.includes("mindmap-a11y"));
  assert.ok(!html.includes('role="img"'));
  assert.ok(html.includes("data-mindmap"), "画布本身照旧");
});

test("空代码块不产出列表", async () => {
  const html = await render("```mindelixir\n\n```\n");

  assert.ok(!html.includes("mindmap-a11y"));
});

test("a11yClass 会追加到列表容器上", async () => {
  const html = await render("```mindelixir\n- 根\n```\n", { a11yClass: "sr-only" });

  assert.ok(html.includes('class="mindmap-a11y sr-only"'));
});

test("行内 markdown：粗体、代码、链接", () => {
  const inline = createInlineMarkdown();

  assert.equal(inline("**加粗**"), "<strong>加粗</strong>");
  assert.equal(inline("`code`"), "<code>code</code>");

  const link = inline("[站点](https://mind-elixir.com)");
  assert.ok(link.includes('href="https://mind-elixir.com"'));
  assert.ok(link.includes("noopener"));
});

test("行内 markdown 先转义再替换", () => {
  const inline = createInlineMarkdown();

  assert.equal(inline("<img src=x onerror=1>"), "&lt;img src=x onerror=1&gt;");
});

test("行内 markdown 不误伤单星号", () => {
  const inline = createInlineMarkdown();

  assert.equal(inline("2*3*4"), "2*3*4");
  assert.equal(inline("乘号 a*b"), "乘号 a*b");
});
