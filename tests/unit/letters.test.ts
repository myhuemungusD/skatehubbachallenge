import { describe, expect, it } from "vitest";
import { lettersForCount } from "@/lib/utils";

describe("lettersForCount", () => {
  it("returns empty string for zero", () => {
    expect(lettersForCount(0)).toBe("");
  });

  it("returns progressively built SK8 string", () => {
    expect(lettersForCount(1)).toBe("S");
    expect(lettersForCount(2)).toBe("S.K");
    expect(lettersForCount(3)).toBe("S.K.8");
  });
});
