import { expect, it } from "vitest";
import { safeNextPath } from "./safe-next";

it.each([
  ["/goals", "/goals"],
  ["/settings/security?tab=2fa", "/settings/security?tab=2fa"],
  [null, "/"],
  [undefined, "/"],
  ["", "/"],
  ["https://evil.example", "/"],
  ["//evil.example", "/"],
  ["/\\evil.example", "/"],
  ["javascript:alert(1)", "/"],
  ["/sign-in", "/"],
])("safeNextPath(%j) -> %j", (input, expected) => {
  expect(safeNextPath(input)).toBe(expected);
});
