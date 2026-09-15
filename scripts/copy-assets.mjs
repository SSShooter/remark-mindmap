/**
 * 把 src/style.css 原样搬到 dist。
 * 不走打包器，因为它就是一份普通的、供宿主直接引用的样式表。
 */
import { copyFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const from = resolve(root, "src/style.css");
const to = resolve(root, "dist/style.css");

await mkdir(dirname(to), { recursive: true });
await copyFile(from, to);

console.log("copy-assets: src/style.css -> dist/style.css");
