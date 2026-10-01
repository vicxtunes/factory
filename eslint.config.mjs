import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Pure domain cores (lib/<module>/core) must stay reusable by any host or
  // tenant: no framework, database or app imports. Other cores and the
  // tenancy types are the only app code they may use.
  {
    files: ["lib/*/core/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["next", "next/*", "react", "react/*", "react-dom", "@supabase/*", "server-only"],
              message: "core/ is pure: no framework or database imports. Put I/O in an adapter.",
            },
            {
              regex: "^@/(?!lib/[^/]+/core(/|$)|lib/tenancy/types$)",
              message: "core/ may only import other cores and @/lib/tenancy/types. Put app access in an adapter.",
            },
          ],
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    ".test-build/**",
  ]),
]);

export default eslintConfig;
