import { aggregateDaily, importSchema, planImport, unionMinutes, type HealthSample } from "@/lib/health-metrics";

const t = (hhmm: string, day = "2026-10-05") => `${day}T${hhmm}:00.000Z`;

describe("aggregateDaily", () => {
    it("sums steps and averages heart rate per local day", () => {
        const samples: HealthSample[] = [
            { key: "steps", date: "2026-10-05", value: 4000 },
            { key: "steps", date: "2026-10-05", value: 2500 },
            { key: "steps", date: "2026-10-06", value: 100 },
            { key: "resting_hr", date: "2026-10-05", value: 60 },
            { key: "resting_hr", date: "2026-10-05", value: 63 },
        ];
        expect(aggregateDaily(samples)).toEqual({
            "2026-10-05": { steps: 6500, resting_hr: 61.5 },
            "2026-10-06": { steps: 100 },
        });
    });

    it("counts overlapping sleep from two sources once, in hours", () => {
        const samples: HealthSample[] = [
            { key: "sleep_total", date: "2026-10-05", start: t("00:00"), end: t("06:00") }, // watch
            { key: "sleep_total", date: "2026-10-05", start: t("01:00"), end: t("07:00") }, // phone
            { key: "sleep_deep", date: "2026-10-05", start: t("02:00"), end: t("03:30") },
        ];
        expect(aggregateDaily(samples)["2026-10-05"]).toEqual({ sleep_total: 7, sleep_deep: 1.5 });
    });

    it("uses the client's local date, never the timestamp's UTC day", () => {
        // 23:30 in Sao Paulo is 02:30 UTC the next day; the device says it is the 5th.
        const out = aggregateDaily([{ key: "mindful", date: "2026-10-05", start: "2026-10-06T02:30:00Z", end: "2026-10-06T02:45:00Z" }]);
        expect(out).toEqual({ "2026-10-05": { mindful: 15 } });
    });
});

describe("unionMinutes", () => {
    it("merges touching and nested intervals", () => {
        const m = (h: number) => h * 3_600_000;
        expect(unionMinutes([[m(0), m(1)], [m(1), m(2)], [m(0.5), m(0.75)], [m(5), m(6)]])).toBe(180);
        expect(unionMinutes([])).toBe(0);
    });
});

describe("planImport", () => {
    const days = ["2026-10-04", "2026-10-05", "2026-10-06"];

    it("creates missing days on the first import", () => {
        expect(planImport(days, [])).toEqual({ create: days, update: [], skippedManual: [], remove: [] });
    });

    it("is idempotent: re-importing updates the imported days instead of duplicating them", () => {
        const existing = days.map((date, i) => ({ id: `e${i}`, date, source: "apple_health" }));
        const plan = planImport(days, existing);
        expect(plan.create).toEqual([]);
        expect(plan.update.map((u) => u.entryId)).toEqual(["e0", "e1", "e2"]);
    });

    it("never touches a day the user logged by hand", () => {
        const plan = planImport(days, [
            { id: "manual", date: "2026-10-05", source: null },
            { id: "imp", date: "2026-10-05", source: "health_connect" },
        ]);
        expect(plan.skippedManual).toEqual(["2026-10-05"]);
        expect(plan.update).toEqual([]);
        expect(plan.create).toEqual(["2026-10-04", "2026-10-06"]);
    });

    it("removes imported days that vanished from the source, never manual ones", () => {
        const plan = planImport(["2026-10-05"], [
            { id: "gone", date: "2026-10-04", source: "apple_health" },
            { id: "kept", date: "2026-10-05", source: "apple_health" },
            { id: "manual", date: "2026-10-03", source: null },
        ]);
        expect(plan.remove).toEqual(["gone"]);
        expect(plan.update).toEqual([{ date: "2026-10-05", entryId: "kept" }]);
    });
});

describe("importSchema", () => {
    const base = { connectionId: 'synthetic-device', source: "apple_health", metrics: ["sleep"], from: "2026-10-01", until: "2026-10-07" };

    it("needs a forward day range", () => {
        expect(importSchema.safeParse({ ...base, samples: [], until: "2026-10-01" }).success).toBe(false);
        expect(importSchema.safeParse({ ...base, samples: [] }).success).toBe(true);
    });


    it("requires intervals for sleep and values for steps", () => {
        expect(importSchema.safeParse({ ...base, samples: [{ key: "sleep_total", date: "2026-10-05", value: 7 }] }).success).toBe(false);
        expect(importSchema.safeParse({ ...base, samples: [{ key: "steps", date: "2026-10-05", start: t("00:00"), end: t("01:00") }] }).success).toBe(false);
        expect(importSchema.safeParse({ ...base, samples: [{ key: "steps", date: "2026-10-05", value: 10 }] }).success).toBe(true);
    });

    it("rejects unknown metrics, bad dates and oversized batches", () => {
        expect(importSchema.safeParse({ ...base, metrics: ["bloodGlucose"], samples: [] }).success).toBe(false);
        expect(importSchema.safeParse({ ...base, samples: [{ key: "steps", date: "5/10/2026", value: 1 }] }).success).toBe(false);
        expect(importSchema.safeParse({ ...base, samples: [{ key: "steps", date: "2026-02-31", value: 1 }] }).success).toBe(false);
        const many = Array.from({ length: 5001 }, () => ({ key: "steps", date: "2026-10-05", value: 1 }));
        expect(importSchema.safeParse({ ...base, samples: many }).success).toBe(false);
    });
});
