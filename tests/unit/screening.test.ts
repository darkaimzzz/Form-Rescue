import { describe, expect, it } from "vitest";
import { ibanValid, looksSensitiveValue, luhnValid, verhoeffValid } from "@form-rescue/core";

// All values below are synthetic/test values (public test card numbers, documentation examples).
describe("value screening", () => {
  it.each([
    "-----BEGIN RSA PRIVATE KEY-----\nMIIEow...",
    "-----BEGIN OPENSSH PRIVATE KEY-----",
    "key AKIAIOSFODNN7EXAMPLE here",
    "ghp_" + "a".repeat(36),
    "xoxb-1234567890-abcdefghij",
    "sk_test_" + "a".repeat(24),
    "sk-proj-" + "A".repeat(30),
    "AIza" + "B".repeat(35),
    "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U",
    "password: hunter2",
    "my api_key=abc123",
    "4111 1111 1111 1111",
    "4242-4242-4242-4242",
    "SSN 123-45-6789",
    "GB82 WEST 1234 5698 7654 32",
    "ABCDE1234F",
  ])("flags %s", (v) => {
    expect(looksSensitiveValue(v)).toBe(true);
  });

  it.each([
    "",
    "Hello, I would like to request a refund for order 12345.",
    "Call me at the office tomorrow.",
    "My favourite numbers are 3, 7 and 42.",
    "The meeting is 2026-09-24 at 10:30.",
    "4111 1111 1111 1112",
    "000-12-3456",
    "Version 1.2.3 released",
    "مرحبا بالعالم 👋 שלום",
  ])("does not flag %s", (v) => {
    expect(looksSensitiveValue(v)).toBe(false);
  });

  it("checksums", () => {
    expect(luhnValid("4111111111111111")).toBe(true);
    expect(luhnValid("4111111111111112")).toBe(false);
    expect(verhoeffValid("2363")).toBe(true);
    expect(verhoeffValid("2364")).toBe(false);
    expect(ibanValid("GB82WEST12345698765432")).toBe(true);
    expect(ibanValid("GB82WEST12345698765433")).toBe(false);
    expect(ibanValid("nonsense")).toBe(false);
  });
});
