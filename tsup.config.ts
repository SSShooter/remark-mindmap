import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    remark: "src/remark.ts",
    client: "src/client.ts",
  },
  format: ["esm"],
  target: "es2022",
  dts: true,
  clean: true,
  treeshake: true,
  // 两个入口共享的只有 200 字节的转义函数。拆成独立 chunk 会让使用者多一个请求，
  // 不划算 —— 各自内联，一个入口就是一个文件。
  splitting: false,
  // mind-elixir 必须保持外部依赖：它既不该被复制进产物（消费者会重复装一份），
  // 也必须在客户端动态 import，让没有思维导图的页面一个字节都不加载。
  external: ["mind-elixir", "mind-elixir/plaintextConverter", "mind-elixir/style.css"],
});
