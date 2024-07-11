import { defineConfig } from "tsup";

export default defineConfig({
    entry: ["src/index.ts", "src/middlewares/index.ts"],
    format: ["cjs", "esm"],
    dts: true,
    splitting: false,
    sourcemap: true,
    clean: true,
});
