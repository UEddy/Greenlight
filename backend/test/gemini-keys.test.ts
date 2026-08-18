import { describe, expect, it } from "vitest";
import { collectGeminiKeys } from "../src/gemini";

/**
 * Key selection, tested without touching the network.
 *
 * The failover exists for one specific moment: a rate limit landing mid
 * recording. It has to be right without a live call to prove it, because
 * proving it live would mean deliberately exhausting a quota.
 */
describe("gemini key selection", () => {
  it("uses the primary key when that is all there is", () => {
    const keys = collectGeminiKeys({ GEMINI_API_KEY: "primary" });
    expect(keys.map((k) => k.value)).toEqual(["primary"]);
  });

  it("puts the backup after the primary, never before", () => {
    const keys = collectGeminiKeys({
      GEMINI_API_KEY: "primary",
      GEMINI_API_KEY_BACKUP: "backup",
    });
    expect(keys.map((k) => k.value)).toEqual(["primary", "backup"]);
    expect(keys[1]!.label).toBe("GEMINI_API_KEY_BACKUP");
  });

  it("works with only a backup configured", () => {
    const keys = collectGeminiKeys({ GEMINI_API_KEY_BACKUP: "backup" });
    expect(keys.map((k) => k.value)).toEqual(["backup"]);
  });

  it("does not count the same key twice when both vars hold it", () => {
    // Otherwise a 429 would fail over to the identical exhausted quota and
    // look like a working fallback while changing nothing.
    const keys = collectGeminiKeys({
      GEMINI_API_KEY: "same",
      GOOGLE_API_KEY: "same",
      GEMINI_API_KEY_BACKUP: "same",
    });
    expect(keys).toHaveLength(1);
  });

  it("lets an explicit constructor key win the order", () => {
    const keys = collectGeminiKeys(
      { GEMINI_API_KEY: "primary", GEMINI_API_KEY_BACKUP: "backup" },
      "explicit",
    );
    expect(keys.map((k) => k.value)).toEqual(["explicit", "primary", "backup"]);
  });

  it("returns nothing when no key is configured", () => {
    expect(collectGeminiKeys({})).toEqual([]);
  });
});
