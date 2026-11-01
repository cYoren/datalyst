export function normalizeEntryNote(note: string | undefined): string | null | undefined {
    if (note === undefined) return undefined;
    const cleaned = note.trim();
    return cleaned.length > 0 ? cleaned : null;
}
