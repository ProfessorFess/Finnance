import { expect, it } from "vitest";
import { isPublicPath } from "./public-paths";

it.each([
  ["/sign-in", true], ["/sign-in/", true], ["/api/auth/session", true], ["/api/auth", true],
  ["/manifest.webmanifest", true], ["/icons/icon-192.png", true], ["/icon.svg", true], ["/apple-icon.png", true],
  ["/sign-insights", false], ["/api/authz", false], ["/api/import", false], ["/", false], ["/goals", false],
])("isPublicPath(%j) -> %j", (path, expected) => {
  expect(isPublicPath(path)).toBe(expected);
});
