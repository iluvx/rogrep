import { watch } from "node:fs";
import type { BunPlugin } from "bun";
import { compile } from "svelte/compiler";

const production = process.argv.includes("--production");
const watchMode = process.argv.includes("--watch");

// Bun's documented Svelte path: a plugin that calls svelte/compiler, then
// Bun.build writes the bundle to dist/.
// https://bun.com/docs/guides/test/svelte-test
// https://bun.com/docs/runtime/plugins
const sveltePlugin: BunPlugin = {
  name: "svelte",
  setup(build) {
    build.onLoad({ filter: /\.svelte$/ }, async ({ path }) => {
      const source = await Bun.file(path).text();
      const result = compile(source, {
        filename: path,
        generate: "client",
        css: "external",
        dev: !production,
      });

      for (const warning of result.warnings) {
        console.warn(`${warning.filename ?? path}: ${warning.message}`);
      }

      const css = result.css?.code ?? "";
      return {
        contents: `${result.js.code}\nexport const css = ${JSON.stringify(css)};\n`,
        loader: "js",
      };
    });
  },
};

async function build(): Promise<boolean> {
  const banner = (await Bun.file("src/meta.js").text()).trimEnd();
  const result = await Bun.build({
    entrypoints: ["./src/index.ts"],
    outdir: "./dist",
    target: "browser",
    format: "iife",
    minify: production,
    naming: "rogrep.user.js",
    banner: `${banner}\n`,
    define: {
      "process.env.NODE_ENV": JSON.stringify(
        production ? "production" : "development",
      ),
    },
    plugins: [sveltePlugin],
  });

  if (!result.success) {
    for (const log of result.logs) {
      console.error(log);
    }
    return false;
  }

  const files = result.outputs.map((output) => output.path).join(", ");
  console.log(`built ${files}`);
  return true;
}

if (!(await build()) && !watchMode) {
  process.exit(1);
}

if (watchMode) {
  let pending: ReturnType<typeof setTimeout> | undefined;
  watch("src", { recursive: true }, () => {
    if (pending) clearTimeout(pending);
    pending = setTimeout(() => {
      void build();
    }, 50);
  });
  console.log("watching src/");
}
