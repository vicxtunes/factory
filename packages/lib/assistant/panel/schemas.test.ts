import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { z } from "zod";

import { agentClientSchema, agentRegisterSchema } from "@repo/lib/agents/core";

// The AI companies get each tool's input as JSON Schema (providers.ts): a module's
// own schema reused as a tool's input must convert.
describe("Alexis tool inputs", () => {
  for (const [name, schema] of Object.entries({ agentClientSchema, agentRegisterSchema: agentRegisterSchema.omit({ agentId: true }) })) {
    it(`${name} converts to JSON Schema`, () => {
      assert.doesNotThrow(() => z.toJSONSchema(schema));
    });
  }
});
