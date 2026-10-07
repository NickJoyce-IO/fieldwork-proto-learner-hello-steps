import assert from "node:assert/strict";
import { test } from "node:test";
import { farewell } from "../../src/greet.ts";

test("says goodbye by name", () => {
  assert.equal(farewell("Ada"), "Goodbye, Ada!");
});

test("says goodbye to everyone when no name is given", () => {
  assert.equal(farewell(), "Goodbye, everyone!");
});
