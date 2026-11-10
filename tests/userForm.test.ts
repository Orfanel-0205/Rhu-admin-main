import { describe, expect, it } from "vitest";

import { isValidOptionalEmail } from "../src/lib/userForm";
import { fieldErrorMessage, toUserErrorMessage } from "../src/lib/toastBus";

describe("user form email", () => {
  it("accepts blank and real addresses", () => {
    expect(isValidOptionalEmail("")).toBe(true);
    expect(isValidOptionalEmail("   ")).toBe(true);
    expect(isValidOptionalEmail(null)).toBe(true);
    expect(isValidOptionalEmail(undefined)).toBe(true);
    expect(isValidOptionalEmail("nurse.ana@gmail.com")).toBe(true);
  });

  it("refuses a sign-in number the browser filled in", () => {
    expect(isValidOptionalEmail("09683214615")).toBe(false);
    expect(isValidOptionalEmail("ana@")).toBe(false);
    expect(isValidOptionalEmail("ana gmail.com")).toBe(false);
  });
});

describe("server validation messages", () => {
  const validation = (errors: Record<string, string[]>) => ({
    response: { status: 422, data: { message: "Validation failed.", errors } },
  });

  it("shows what was wrong instead of a bare 'Validation failed.'", () => {
    expect(toUserErrorMessage(validation({ email: ["The email field must be a valid email address."] }))).toBe(
      "The email field must be a valid email address."
    );
  });

  it("says how many more problems there are", () => {
    expect(
      toUserErrorMessage(
        validation({
          email: ["The email field must be a valid email address."],
          password: ["The password field confirmation does not match."],
        })
      )
    ).toBe("The email field must be a valid email address. (and 1 more)");
  });

  it("falls back to the server message when there are no field errors", () => {
    expect(toUserErrorMessage({ response: { status: 422, data: { message: "Email is already registered." } } })).toBe(
      "Email is already registered."
    );
    expect(fieldErrorMessage({ message: "x" })).toBe("");
    expect(fieldErrorMessage({ errors: {} })).toBe("");
  });
});
