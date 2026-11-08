import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { takeLines } from "./lines";

describe("reading Alexis's stream", () => {
  it("holds back a line split across chunks until it's whole", () => {
    let held = "";
    const got: string[] = [];
    for (const chunk of ['{"type":"st', 'ep","words":"Look', 'ing"}\n{"type":"text","step":0,"delta":"Hi"}\n{"ty', 'pe":"done"}\n']) {
      const r = takeLines(held, chunk);
      held = r.held;
      got.push(...r.lines);
    }
    assert.deepEqual(got.map((l) => JSON.parse(l).type), ["step", "text", "done"]);
    assert.equal(held, "");
  });
  it("skips blank lines and keeps an unfinished last line", () => {
    const r = takeLines("", '{"a":1}\n\n{"b":2');
    assert.deepEqual(r.lines, ['{"a":1}']);
    assert.equal(r.held, '{"b":2');
  });
  it("keeps words with new lines inside them whole (JSON escapes them)", () => {
    const line = JSON.stringify({ type: "text", step: 0, delta: "Line one\nLine two" });
    const r = takeLines("", `${line}\n`);
    assert.equal(JSON.parse(r.lines[0]!).delta, "Line one\nLine two");
  });
});
