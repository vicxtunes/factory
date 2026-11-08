// Runs Alexis's behaviour evaluations (packages/lib/assistant/panel/evals/run.ts):
// real conversations with the real AI, tools answering from fixtures.
//
//   npm run eval:alexis                       every scenario, with the live model
//   npm run eval:alexis -- "studio"           only scenarios whose name contains "studio"
//   ALEXIS_EVAL_MODEL=claude-sonnet-5-5 npm run eval:alexis
//
// Needs the AI key in apps/client/.env.local (OPENAI_API_KEY or ANTHROPIC_API_KEY).
// Costs a few US cents a run. Nothing reads or writes the database.

import { readFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { build } from "esbuild";

const root = fileURLToPath(new URL("..", import.meta.url));

// The client app's settings, without printing them (a value may hold "<…>" or spaces: no shell sourcing).
for (const line of readFileSync(join(root, "apps/client/.env.local"), "utf8").split("\n")) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
  if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^"(.*)"$/, "$1");
}

const outDir = join(root, ".test-build");
mkdirSync(outDir, { recursive: true });
const outfile = join(outDir, "alexis-evals.mjs");
await build({
  entryPoints: [join(root, "packages/lib/assistant/panel/evals/run.ts")],
  outfile,
  bundle: true,
  platform: "node",
  format: "esm",
  logLevel: "warning",
  plugins: [
    {
      // "server-only" refuses to load outside Next's server: here it's nothing.
      name: "server-only",
      setup(b) {
        b.onResolve({ filter: /^server-only$/ }, () => ({ path: "server-only", namespace: "empty" }));
        b.onLoad({ filter: /.*/, namespace: "empty" }, () => ({ contents: "", loader: "js" }));
      },
    },
    {
      // Next's request functions only work inside Next. Fixture tools never reach them; anything that does fails loudly.
      name: "next-stand-ins",
      setup(b) {
        b.onResolve({ filter: /^next\/(headers|navigation|cache|server)$/ }, (args) => ({ path: args.path, namespace: "next-stand-in" }));
        b.onLoad({ filter: /.*/, namespace: "next-stand-in" }, () => ({
          loader: "js",
          contents: `
            const no = (name) => () => { throw new Error(name + " isn't available in the evaluations"); };
            export const cookies = no("cookies"), headers = no("headers"), redirect = no("redirect"), notFound = no("notFound");
            export const revalidatePath = no("revalidatePath"), revalidateTag = no("revalidateTag"), updateTag = no("updateTag"), after = no("after");
            export const unstable_cache = (fn) => fn;
            export class NextResponse {}
          `,
        }));
      },
    },
    {
      // The repo's own packages are bundled; everything from npm loads from node_modules as it is.
      name: "npm-external",
      setup(b) {
        b.onResolve({ filter: /^[^./]/ }, (args) => (args.path.startsWith("@repo/") || args.path === "server-only" ? undefined : { path: args.path, external: true }));
      },
    },
  ],
});

const { main } = await import(pathToFileURL(outfile).href);
const failed = await main(process.env.ALEXIS_EVAL_MODEL || "gpt-6.1-terra", process.argv[2]);
process.exit(failed ? 1 : 0);
