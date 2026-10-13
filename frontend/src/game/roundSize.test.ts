import { describe, expect, test } from "vitest";
import { parseBoundedCount } from "./roundSize";

describe("parseBoundedCount", () => {
  test.each([
    ["3", 5, 3],
    ["  3  ", 5, 3],
    ["1", 1, 1],
    ["3.0", 5, 3],
  ])("accepts %p (max %p) as %p", (raw, max, expected) => {
    expect(parseBoundedCount(raw, max)).toBe(expected);
  });

  test.each([
    ["0", 5],
    ["-1", 5],
    ["6", 5],
    ["2.5", 5],
    ["", 5],
    ["   ", 5],
    ["abc", 5],
    ["3,4", 5],
  ])("rejects %p (max %p)", (raw, max) => {
    expect(parseBoundedCount(raw, max)).toBeNull();
  });
});
