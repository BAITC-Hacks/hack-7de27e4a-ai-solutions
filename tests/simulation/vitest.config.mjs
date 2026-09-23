import ts from "typescript";
import { fileURLToPath } from "node:url";
// Use the same TypeScript compiler in-process, also in Windows sandboxes without child pipes.
export default {
  root: fileURLToPath(new URL(".standalone", import.meta.url)),
  esbuild: false,
  plugins: [
    {
      name: "in-process-typescript",
      enforce: "pre",
      transform(code, id) {
        if (!/\.tsx?$/.test(id) || id.includes("node_modules")) return null;
        return ts.transpileModule(code, {
          compilerOptions: {
            target: ts.ScriptTarget.ES2022,
            module: ts.ModuleKind.ESNext,
            jsx: ts.JsxEmit.ReactJSX,
            sourceMap: true,
          },
          fileName: id,
        }).outputText;
      },
    },
  ],
  test: {
    pool: "threads",
    maxWorkers: 1,
    minWorkers: 1,
    include: ["tests/simulation/**/*.test.ts"],
  },
};
