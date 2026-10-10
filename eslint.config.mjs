import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Monorepo: the Next.js apps live under apps/.
  { settings: { next: { rootDir: "apps/*/" } } },
  // Pure domain cores (packages/lib/<module>/core) must stay reusable by any host or
  // tenant: no framework, database or app imports. Other cores and the
  // tenancy types are the only app code they may use.
  {
    files: ["packages/lib/*/core/**/*.{ts,tsx}"],
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
              regex: "^@/|^@repo/(?!lib/[^/]+/core(/|$)|lib/tenancy/types$)",
              message: "core/ may only import other cores and @repo/lib/tenancy/types. Put app access in an adapter.",
            },
          ],
        },
      ],
    },
  },
  // Supabase's signOut defaults to scope "global": it ends the account's
  // sessions on every device, so one person signing in or out logged
  // everyone else out. Always say which session.
  {
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "CallExpression[callee.property.name='signOut'][arguments.length=0]",
          message: 'signOut() signs the account out on every device. Pass { scope: "local" }.',
        },
        {
          selector: "CallExpression[callee.property.name='signOut'][callee.object.property.name='admin'][arguments.length=1]",
          message: 'admin.signOut(jwt) ends every session the account has. Pass "local" as the scope.',
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    "**/.next/**",
    "out/**",
    "build/**",
    "**/next-env.d.ts",
    ".test-build/**",
  ]),
]);

export default eslintConfig;
