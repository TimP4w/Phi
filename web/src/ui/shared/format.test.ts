import { describe, it, expect } from "vitest";
import {
  formatCores,
  formatBytes,
  usagePercent,
  usageColor,
  shortRevision,
  gitCommitUrl,
} from "./format";

describe("formatCores", () => {
  it("renders sub-core values as millicores", () => {
    expect(formatCores(0.35)).toBe("350m");
    expect(formatCores(0.001)).toBe("1m");
  });

  it("renders whole cores to two decimals", () => {
    expect(formatCores(2.1)).toBe("2.10");
    expect(formatCores(1)).toBe("1.00");
  });
});

describe("formatBytes", () => {
  it("keeps small byte values without a fractional part", () => {
    expect(formatBytes(512)).toBe("512B");
  });

  it("steps up units and shows one decimal below 10", () => {
    expect(formatBytes(1536)).toBe("1.5Ki");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.0Mi");
  });

  it("rounds when the scaled value is 10 or more", () => {
    expect(formatBytes(20 * 1024)).toBe("20Ki");
  });

  it("caps at the largest unit", () => {
    expect(formatBytes(3 * 1024 ** 4)).toBe("3.0Ti");
  });
});

describe("usagePercent", () => {
  it("computes a percentage", () => {
    expect(usagePercent(50, 200)).toBe(25);
  });

  it("clamps to 100 when used exceeds total", () => {
    expect(usagePercent(300, 200)).toBe(100);
  });

  it("returns 0 when total is zero", () => {
    expect(usagePercent(10, 0)).toBe(0);
  });
});

describe("usageColor", () => {
  it("is danger at or above 90", () => {
    expect(usageColor(90)).toBe("danger");
    expect(usageColor(100)).toBe("danger");
  });

  it("is warning between 75 and 90", () => {
    expect(usageColor(75)).toBe("warning");
    expect(usageColor(89.9)).toBe("warning");
  });

  it("returns the supplied ok colour below 75", () => {
    expect(usageColor(10)).toBe("success");
    expect(usageColor(10, "accent")).toBe("accent");
  });
});

describe("shortRevision", () => {
  it("takes the last segment after ':' or '@'", () => {
    expect(shortRevision("main@sha1:abcdef")).toBe("abcdef");
    expect(shortRevision("v1.2.3")).toBe("v1.2.3");
  });

  it("truncates long hashes to 12 chars", () => {
    expect(shortRevision("main@sha256:0123456789abcdef")).toBe("0123456789ab");
  });
});

describe("gitCommitUrl", () => {
  it("builds an https commit url from an https remote", () => {
    expect(gitCommitUrl("https://github.com/org/repo.git", "abc")).toBe(
      "https://github.com/org/repo/commit/abc",
    );
  });

  it("normalises an ssh (git@) remote", () => {
    expect(gitCommitUrl("git@github.com:org/repo.git", "abc")).toBe(
      "https://github.com/org/repo/commit/abc",
    );
  });
});
