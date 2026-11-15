import { describe, expect, it } from "vitest";
import { codeErrorMessage, signInErrorMessage } from "./auth-errors";

describe("signInErrorMessage", () => {
  it("says the credentials are wrong only for 401", () => {
    expect(signInErrorMessage(401)).toBe("Invalid email or password.");
  });
  it("explains rate limiting", () => {
    expect(signInErrorMessage(429)).toBe("Too many attempts. Try again in a minute.");
  });
  it.each([400, 403, 500, undefined])("does not blame the password for status %s", (status) => {
    expect(signInErrorMessage(status)).toBe("Something went wrong signing in. Please try again.");
  });
});

describe("codeErrorMessage", () => {
  it("says the code is wrong for 401", () => {
    expect(codeErrorMessage(401)).toBe("That code didn't work. Try again.");
  });
  it("explains rate limiting", () => {
    expect(codeErrorMessage(429)).toBe("Too many attempts. Try again in a minute.");
  });
  it("is generic for other failures", () => {
    expect(codeErrorMessage(500)).toBe("Something went wrong. Please try again.");
  });
});
