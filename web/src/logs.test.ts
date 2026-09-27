import { expect, it } from "vitest";
import { ansiSegments, findLogMatches } from "./logs";

it("finds literal case-insensitive text across ANSI style boundaries", () => {
  const segments = ansiSegments("start ERROR[1] and \x1b[31merr\x1b[0mor[1]");
  expect(findLogMatches(segments, "error[1]")).toEqual([6, 19]);
  expect(findLogMatches(segments, "missing")).toEqual([]);
  expect(findLogMatches(segments, "")).toEqual([]);
});

it("preserves terminal colors and removes terminal hyperlinks", () => {
  const segments = ansiSegments(
    "\x1b[31mError\x1b[0m\n\x1b]8;;https://example.com\x1b\\details\x1b]8;;\x1b\\\n",
  );
  expect(segments.map((segment) => segment.text).join("")).toBe(
    "Error\ndetails\n",
  );
  expect(segments[0].style.color).toBe("#cc241d");
});
