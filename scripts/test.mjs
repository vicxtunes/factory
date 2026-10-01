// Runs the unit tests for pure modules (lib/**/core/*.test.ts).
//
// Each test file is bundled with esbuild (already a dependency, via Next) so
// the "@/" import alias and extensionless imports work, then run with Node's
// built-in test runner. No extra test framework needed.

import { spawnSync } from "node:child_process";
import { mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";

const root = fileURLToPath(new URL("..", import.meta.url));
const outDir = join(root, ".test-build");

function findTests(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "node_modules" ? [] : findTests(path);
    return /\/core\/[^/]+\.test\.ts$/.test(path) ? [path] : [];
  });
}

const tests = findTests(join(root, "lib"));
if (tests.length === 0) {
  console.log("No tests found.");
  process.exit(0);
}

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

const outputs = [];
for (const file of tests) {
  const outfile = join(outDir, relative(root, file).replace(/\.ts$/, ".mjs"));
  await build({
    entryPoints: [file],
    outfile,
    bundle: true,
    platform: "node",
    format: "esm",
    alias: { "@": root },
    logLevel: "warning",
  });
  outputs.push(outfile);
}

const result = spawnSync(process.execPath, ["--test", ...outputs], { stdio: "inherit" });
process.exit(result.status ?? 1);
