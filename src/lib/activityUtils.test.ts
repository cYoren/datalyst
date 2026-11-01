import {
    buildActivityDayRows,
    calculateActivityIntensity,
    formatDateKeyInTimeZone,
} from "@/lib/activityUtils";

describe("calculateActivityIntensity", () => {
    it.each([
        { completionPct: 0, entriesCount: 0, expected: 0 },
        { completionPct: 0, entriesCount: 1, expected: 1 },
        { completionPct: 1, entriesCount: 0, expected: 1 },
        { completionPct: 24, entriesCount: 0, expected: 1 },
        { completionPct: 25, entriesCount: 0, expected: 2 },
        { completionPct: 49, entriesCount: 0, expected: 2 },
        { completionPct: 50, entriesCount: 0, expected: 3 },
        { completionPct: 79, entriesCount: 0, expected: 3 },
        { completionPct: 80, entriesCount: 0, expected: 4 },
        { completionPct: 100, entriesCount: 0, expected: 4 },
    ])("returns bucket $expected for completion $completionPct and entries $entriesCount", ({ completionPct, entriesCount, expected }) => {
        expect(calculateActivityIntensity(completionPct, entriesCount)).toBe(expected);
    });
});

describe("timezone-safe day aggregation", () => {
    it("formats local date keys per timezone at day boundaries", () => {
        const edge = new Date("2026-03-02T02:30:00.000Z");

        expect(formatDateKeyInTimeZone(edge, "UTC")).toBe("2026-03-02");
        expect(formatDateKeyInTimeZone(edge, "America/Sao_Paulo")).toBe("2026-03-01");
    });

    it("aggregates entries into the correct local day and scheduled tracker totals", () => {
        const rows = buildActivityDayRows({
            habits: [
                {
                    id: "habit_daily",
                    scheduleType: "DAILY",
                    scheduleDays: [],
                    schedule: null,
                },
                {
                    id: "habit_monday",
                    scheduleType: "WEEKLY",
                    scheduleDays: [1],
                    schedule: null,
                },
            ],
            entries: [
                {
                    habitId: "habit_daily",
                    // 11:30pm local time on 2026-03-01 (America/Los_Angeles)
                    logicalDate: new Date("2026-03-02T07:30:00.000Z"),
                },
                {
                    habitId: "habit_daily",
                    // 12:30am local time on 2026-03-02 (America/Los_Angeles)
                    logicalDate: new Date("2026-03-02T08:30:00.000Z"),
                },
            ],
            startDate: new Date("2026-03-01T12:00:00.000Z"),
            days: 2,
            timeZone: "America/Los_Angeles",
        });

        expect(rows).toHaveLength(2);

        expect(rows[0]).toMatchObject({
            date: "2026-03-01",
            scheduledTrackers: 1,
            completedTrackers: 1,
            completionPct: 100,
            entriesCount: 1,
            intensity: 4,
        });

        expect(rows[1]).toMatchObject({
            date: "2026-03-02",
            scheduledTrackers: 2,
            completedTrackers: 1,
            completionPct: 50,
            entriesCount: 1,
            intensity: 3,
        });
    });
});
