import { normalizeEntryNote } from "@/lib/entryUtils";

describe("normalizeEntryNote", () => {
    it("returns undefined for undefined input", () => {
        expect(normalizeEntryNote(undefined)).toBeUndefined();
    });

    it("returns null for empty or whitespace-only values", () => {
        expect(normalizeEntryNote("")).toBeNull();
        expect(normalizeEntryNote("    ")).toBeNull();
    });

    it("trims note text", () => {
        expect(normalizeEntryNote("  focused work block  ")).toBe("focused work block");
    });
});
