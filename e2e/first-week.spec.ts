import { expect, test, type Page } from "@playwright/test";

/**
 * `ROADMAP.md` W4: something back on days one, three and seven, rendered on Today.
 *
 * The copy is unit-tested in `src/lib/return-card.test.ts`; this asserts the card reaches the
 * screen at the three phone widths, and that the day-seven line carries its n and its caution
 * where a person reads it.
 */

const WIDTHS = [360, 390, 412] as const;

async function stubPerson(page: Page) {
    await page.route("**/api/user", (route) =>
        route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ user: { email: "week@test.local", name: "Week Tester" } }),
        }),
    );
    await page.route("**/api/dashboard", (route) =>
        route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
                habits: [
                    {
                        id: "habit_headache",
                        name: "Headache",
                        description: "Severity",
                        icon: "🤕",
                        habitColor: "#0ea5a4",
                        schedule: "{}",
                        subvariables: [{ id: "sv_headache" }],
                        entries: [],
                    },
                ],
                stats: { weeklyCompletion: 60, dailyProgress: { percentage: 100, completed: 1, total: 1 } },
                insights: { correlations: [], generatedAt: new Date().toISOString() },
                user: { email: "week@test.local", name: "Week Tester", profile: { healthDataConsent: true } },
            }),
        }),
    );
    await page.route("**/api/today**", (route) =>
        route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ habits: [], entries: [], completed: 0, total: 0 }),
        }),
    );
}

const DAY_ONE = {
    card: { kind: "day-1", headline: "Logged.", detail: "Tomorrow at the same time? A reminder makes the second day the easy one.", offerReminder: true },
    lines: { title: "Logged.", body: ["Tomorrow at the same time? A reminder makes the second day the easy one."] },
    suggestedReminderTime: "21:15",
};

const DAY_THREE = {
    card: { kind: "day-3", headline: "Three days of Headache", days: [] },
    lines: { title: "Three days of Headache", body: ["Thu: 6 /10", "Fri: not logged", "Sat: 4 /10"] },
};

const DAY_SEVEN = {
    card: { kind: "day-7", headline: "Your week of Headache", best: null, worst: null, average: 4.7, loggedDays: 6, comparison: null },
    lines: {
        title: "Your week of Headache",
        body: [
            "Best day: Sat (2 /10).",
            "Hardest day: Mon (8 /10).",
            "Average 4.7 /10 across 6 logged days.",
            "On the 3 days with Sleep up to 5 h, headache averaged 6.3 /10; on the 3 days with Sleep over 5 h, it averaged 3.1 /10 (6 days logged, too few to call a pattern).",
        ],
    },
};

for (const width of WIDTHS) {
    test(`the first-week card renders each day at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 844 });
        await stubPerson(page);

        for (const [payload, kind] of [
            [DAY_ONE, "day-1"],
            [DAY_THREE, "day-3"],
            [DAY_SEVEN, "day-7"],
        ] as const) {
            await page.route("**/api/first-week", (route) =>
                route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(payload) }),
            );

            await page.goto("/dashboard");
            const card = page.getByTestId("first-week-card");
            await expect(card).toHaveAttribute("data-kind", kind);
            await expect(card.getByRole("heading")).toHaveText(payload.lines.title);

            // Nothing may be cut off at the narrowest phone.
            const box = await card.boundingBox();
            expect(box, kind).not.toBeNull();
            expect(box!.width).toBeLessThanOrEqual(width);

            if (kind === "day-7") {
                // The acceptance line: the description carries its n and its caution.
                await expect(card).toContainText("6 days logged, too few to call a pattern");
                await expect(card).not.toContainText(/significant|proves/i);
            }

            await page.unroute("**/api/first-week");
        }
    });
}

test("no card on a day that is not one, three or seven", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await stubPerson(page);
    await page.route("**/api/first-week", (route) =>
        route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ card: null }) }),
    );

    await page.goto("/dashboard");
    await expect(page.getByTestId("first-week-card")).toHaveCount(0);
});
