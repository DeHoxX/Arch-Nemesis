import { describe, expect, it } from "vitest";
import { metadata } from "./layout";

describe("Admin Layout Metadata", () => {
  it("exports metadata marking all admin pages as noindex and nofollow", () => {
    expect(metadata.robots).toEqual({
      index: false,
      follow: false,
    });
  });
});

