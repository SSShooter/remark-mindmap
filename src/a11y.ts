import { plaintextToMindElixir } from "mind-elixir/plaintextConverter";
import type { MindElixirData, NodeObj } from "mind-elixir";

import { createInlineMarkdown } from "./inline-markdown.js";

/**
 * 把 plaintext 编译成一份语义化列表，作为画布的文本替代（text alternative）。
 * 屏幕阅读器读到的就是它，抓取器读到的也是它。
 *
 * 层次刻意**交给上游的 `plaintextToMindElixir` 解析**，不在这里重写一遍缩进规则 ——
 * 两套解析迟早会漂移，那列表就会和画布上的节点对不上，或者干脆报错。
 *
 * 输出必须放在画布**外面**：mind-elixir 的构造函数会清空宿主容器
 * （`D.innerHTML = ""`，见 MindElixir.js 的 constructor），写在里面会被渲染时抹掉。
 */

const renderInline = createInlineMarkdown();

export interface MindmapTextAlternative {
  /** 画布的无障碍名称（根节点文字），供 `aria-label` 使用，是纯文本而非 HTML */
  label: string;
  /** 列表 HTML：一棵 `<ul>` 承载层次，有连线时再跟一棵 `<ul>` 承载关系 */
  html: string;
}

export function renderMindmapText(
  plaintext: string,
  rootTopic: string,
): MindmapTextAlternative | undefined {
  // 空代码块渲染不出任何东西（客户端也会跳过），这里同样不产出列表，
  // 免得画布是空的、列表却有内容
  if (!plaintext.trim()) return undefined;

  let data: MindElixirData;
  try {
    data = plaintextToMindElixir(plaintext, rootTopic);
  } catch {
    // 解析不了就退化成"没有文本替代"。真实的报错由客户端在控制台给出，
    // 构建阶段不该因为一个写坏的导图而中断
    return undefined;
  }

  const topics = new Map<string, string>();
  const collectTopics = (node: NodeObj): void => {
    topics.set(node.id, node.topic);
    for (const child of node.children ?? []) collectTopics(child);
  };
  collectTopics(data.nodeData);

  const summariesByParent = new Map<string, string[]>();
  for (const summary of data.summaries ?? []) {
    const labels = summariesByParent.get(summary.parent) ?? [];
    labels.push(summary.label);
    summariesByParent.set(summary.parent, labels);
  }

  const renderNode = (node: NodeObj): string => {
    const items = (node.children ?? []).map(renderNode);
    // 概要不是子节点，但它的文字确实画在图上，所以挂在父节点的列表末尾
    for (const label of summariesByParent.get(node.id) ?? []) {
      items.push(`<li>${renderInline(label)}</li>`);
    }

    const nested = items.length > 0 ? `<ul>${items.join("")}</ul>` : "";
    return `<li>${renderInline(node.topic)}${nested}</li>`;
  };

  // 连线是一条跨分支的关系，塞进树里会变成"假的子节点"，所以另起一棵列表
  const relations = (data.arrows ?? []).flatMap((arrow) => {
    const from = topics.get(arrow.from);
    const to = topics.get(arrow.to);
    if (from === undefined || to === undefined) return [];

    const label = arrow.label ? `（${renderInline(arrow.label)}）` : "";
    return [`<li>${renderInline(from)} → ${renderInline(to)}${label}</li>`];
  });

  const blocks = [`<ul>${renderNode(data.nodeData)}</ul>`];
  if (relations.length > 0) blocks.push(`<ul>${relations.join("")}</ul>`);

  return { label: data.nodeData.topic, html: blocks.join("") };
}
