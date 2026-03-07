import { describe, it, expect } from "vitest";
import { getDuplicateName, getAvailableDuplicateName } from "./file-utils";

describe("getDuplicateName", () => {
  it("adds (copy) suffix", () => {
    expect(getDuplicateName("foo.txt")).toBe("foo (copy).txt");
  });

  it("increments existing (copy) to (copy 2)", () => {
    expect(getDuplicateName("foo (copy).txt")).toBe("foo (copy 2).txt");
  });

  it("increments (copy 2) to (copy 3)", () => {
    expect(getDuplicateName("foo (copy 2).txt")).toBe("foo (copy 3).txt");
  });

  it("handles no extension", () => {
    expect(getDuplicateName("foo")).toBe("foo (copy)");
  });

  it("handles dotfiles as extensionless names", () => {
    expect(getDuplicateName(".gitignore")).toBe(".gitignore (copy)");
  });

  it("only splits on last dot (foo.tar.gz)", () => {
    expect(getDuplicateName("foo.tar.gz")).toBe("foo.tar (copy).gz");
  });

  it("handles no-extension copy increment", () => {
    expect(getDuplicateName("foo (copy)")).toBe("foo (copy 2)");
  });

  it("handles no-extension copy 2 increment", () => {
    expect(getDuplicateName("foo (copy 2)")).toBe("foo (copy 3)");
  });
});

describe("getAvailableDuplicateName", () => {
  it("returns first copy name when no collision", () => {
    expect(getAvailableDuplicateName("foo.txt", new Set())).toBe("foo (copy).txt");
  });

  it("skips to copy 2 when copy already exists", () => {
    expect(
      getAvailableDuplicateName("foo.txt", new Set(["foo (copy).txt"])),
    ).toBe("foo (copy 2).txt");
  });

  it("skips to copy 3 when copy and copy 2 exist", () => {
    expect(
      getAvailableDuplicateName(
        "foo.txt",
        new Set(["foo (copy).txt", "foo (copy 2).txt"]),
      ),
    ).toBe("foo (copy 3).txt");
  });

  it("handles no-extension files", () => {
    expect(
      getAvailableDuplicateName("foo", new Set(["foo (copy)"])),
    ).toBe("foo (copy 2)");
  });
});
