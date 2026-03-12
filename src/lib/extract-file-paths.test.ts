import { describe, expect, it } from "vitest";
import {
  extractFilePathsFromResult,
  extractPathFromDiffIntro,
} from "./extract-file-paths";

describe("extractFilePathsFromResult", () => {
  it("extracts path from diagram tool result with correct positions", () => {
    const result = "Diagram saved to: output/chart.png";
    const extracted = extractFilePathsFromResult("diagram", result);

    expect(extracted).toHaveLength(1);
    expect(extracted[0]!.path).toBe("output/chart.png");
    // Verify start/end offsets point to the path inside the result string
    expect(result.slice(extracted[0]!.start, extracted[0]!.end)).toBe("output/chart.png");
  });

  it("extracts path from office tool result", () => {
    const result = "Document saved to: report.docx";
    const extracted = extractFilePathsFromResult("office", result);

    expect(extracted).toHaveLength(1);
    expect(extracted[0]!.path).toBe("report.docx");
    expect(result.slice(extracted[0]!.start, extracted[0]!.end)).toBe("report.docx");
  });

  it("handles extra whitespace between label and path", () => {
    // The pattern uses \s* so leading spaces before path are consumed by regex,
    // and the extracted path is trimmed — offsets must still be accurate.
    const result = "Diagram saved to:   /abs/path/file.svg";
    const extracted = extractFilePathsFromResult("diagram", result);

    expect(extracted).toHaveLength(1);
    expect(extracted[0]!.path).toBe("/abs/path/file.svg");
    expect(result.slice(extracted[0]!.start, extracted[0]!.end)).toBe("/abs/path/file.svg");
  });

  it("returns empty array for unknown tool name", () => {
    const extracted = extractFilePathsFromResult("bash", "Diagram saved to: output/chart.png");
    expect(extracted).toEqual([]);
  });

  it("returns empty array when result text has no pattern match", () => {
    const extracted = extractFilePathsFromResult("diagram", "No paths here at all.");
    expect(extracted).toEqual([]);
  });

  it("returns empty array for empty result string", () => {
    expect(extractFilePathsFromResult("office", "")).toEqual([]);
  });
});

describe("extractPathFromDiffIntro", () => {
  it("extracts path from 'wrote to' intro", () => {
    expect(extractPathFromDiffIntro("Successfully wrote to src/main.ts")).toBe("src/main.ts");
  });

  it("extracts path from 'edited' intro", () => {
    expect(extractPathFromDiffIntro("Successfully edited src/lib/utils.ts")).toBe("src/lib/utils.ts");
  });

  it("extracts path from 'created' intro", () => {
    expect(extractPathFromDiffIntro("Created /tmp/file.txt")).toBe("/tmp/file.txt");
  });

  it("strips trailing period from path", () => {
    // The regex uses \.?$ so a single trailing dot is not part of the path
    expect(extractPathFromDiffIntro("Created /tmp/file.txt.")).toBe("/tmp/file.txt");
  });

  it("extracts path from 'saved to' intro", () => {
    expect(extractPathFromDiffIntro("saved to output/diagram.png")).toBe("output/diagram.png");
  });

  it("returns null when no known verb is present", () => {
    expect(extractPathFromDiffIntro("Some random text")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(extractPathFromDiffIntro("")).toBeNull();
  });
});
