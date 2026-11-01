import { expect, test, type Page } from "@playwright/test";

const MOBILE_WIDTHS = [360, 390, 412] as const;

async function runMobileFlow(width: number, page: Page) {
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const entryDateIso = `${today}T12:00:00.000Z`;
    let hasLogged = false;

    await page.setViewportSize({ width, height: 844 });

    await page.route("**/api/user", async (route) => {
        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
                user: {
                    email: "mobile@test.local",
                    name: "Mobile Tester",
                },
            }),
        });
    });

    await page.route("**/api/dashboard", async (route) => {
        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
                habits: [
                    {
                        id: "habit_sleep",
                        name: "Sleep",
                        description: "Daily sleep quality",
                        icon: "😴",
                        habitColor: "#0ea5a4",
                        schedule: "{}",
                        subvariables: [{ id: "sv_sleep_quality" }],
                        entries: [],
                    },
                ],
                stats: {
                    weeklyCompletion: 80,
                    dailyProgress: { percentage: hasLogged ? 100 : 0, completed: hasLogged ? 1 : 0, total: 1 },
                    weeklySummary: { daysActive: 5, totalEntries: 9, avgEntriesPerDay: 1.8 },
                    totalLoggingDays: 22,
                },
                insights: {
                    correlations: [],
                    generatedAt: now.toISOString(),
                    cached: true,
                },
                user: {
                    email: "mobile@test.local",
                    name: "Mobile Tester",
                },
            }),
        });
    });

    await page.route(/\/api\/dashboard\/today(\?|$)/, async (route) => {
        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
                variables: [
                    {
                        id: "sv_sleep_quality",
                        name: "Sleep quality",
                        type: "BOOLEAN",
                        habitId: "habit_sleep",
                        habitName: "Sleep",
                        habitIcon: "😴",
                        habitColor: "#0ea5a4",
                        timeBlock: "MORNING",
                        rank: 0,
                        todayEntry: hasLogged ? {
                            entryId: "entry_today",
                            subvariableEntryId: "sub_entry_today",
                            numericValue: 1,
                            rawValue: "Yes",
                        } : undefined,
                    },
                    {
                        id: "sv_mood",
                        name: "Mood",
                        type: "CATEGORY",
                        metadata: { options: ["Great", "Okay", "Low"] },
                        habitId: "habit_sleep",
                        habitName: "Sleep",
                        habitIcon: "😴",
                        habitColor: "#0ea5a4",
                        timeBlock: "EVENING",
                        rank: 1,
                    },
                ],
                logged: hasLogged ? 1 : 0,
                total: 2,
                percentage: hasLogged ? 50 : 0,
            }),
        });
    });

    await page.route("**/api/dashboard/activity?*", async (route) => {
        const days = Array.from({ length: 30 }, (_, index) => {
            const date = new Date(now);
            date.setDate(now.getDate() - (29 - index));
            const key = date.toISOString().slice(0, 10);
            const isToday = key === today;

            return {
                date: key,
                completedTrackers: isToday ? 1 : 0,
                scheduledTrackers: 1,
                completionPct: isToday ? 100 : 0,
                entriesCount: isToday ? 1 : 0,
                intensity: isToday ? 4 : 0,
            };
        });

        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ days }),
        });
    });

    await page.route("**/api/experiments/active-assignment", async (route) => {
        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({}),
        });
    });

    const quickEntries: Array<Record<string, unknown>> = [];
    await page.route("**/api/entries/quick", async (route) => {
        hasLogged = true;
        quickEntries.push(route.request().postDataJSON());
        await route.fulfill({
            status: 201,
            contentType: "application/json",
            body: JSON.stringify({
                success: true,
                entry: {
                    habitEntryId: "entry_today",
                    subvariableEntryId: "sub_entry_today",
                    numericValue: 1,
                    rawValue: "Yes",
                },
            }),
        });
    });

    await page.route("**/api/data", async (route) => {
        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
                habits: [
                    {
                        id: "habit_sleep",
                        name: "Sleep",
                        icon: "😴",
                        color: "#0ea5a4",
                        subvariables: [
                            {
                                id: "sv_sleep_quality",
                                name: "Sleep quality",
                                type: "BOOLEAN",
                                unit: null,
                                metadata: null,
                                order: 0,
                            },
                        ],
                    },
                ],
                entries: [
                    {
                        id: "entry_today",
                        habitId: "habit_sleep",
                        logicalDate: entryDateIso,
                        note: "Felt well-rested",
                        subvariableEntries: [
                            {
                                subvariableId: "sv_sleep_quality",
                                numericValue: 1,
                                rawValue: "Yes",
                            },
                        ],
                    },
                ],
            }),
        });
    });

    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { name: "Daily Check-in" }).first()).toBeVisible();
    await page.getByRole("button", { name: "Set Sleep quality to yes" }).click();
    await expect(page.getByRole("button", { name: "Set Sleep quality to yes" })).toHaveAttribute("aria-pressed", "true");

    // Category variables log the option label as rawValue and its index as numericValue.
    await page.getByRole("button", { name: "Set Mood to Okay" }).click();
    await expect.poll(() => quickEntries.at(-1)).toMatchObject({
        subvariableId: "sv_mood",
        numericValue: 1,
        rawValue: "Okay",
    });

    await page.getByLabel("Activity calendar").evaluate((node) => {
        node.scrollLeft = node.scrollWidth;
        node.dispatchEvent(new Event("scroll"));
    });
    await page.getByRole("button", { name: new RegExp(`^${today},`) }).click();
    await page.getByRole("button", { name: /open entries for/i }).click();

    await expect(page).toHaveURL(new RegExp(`/data\\?`));
    await expect(page.getByText(`Opened entry for ${today}.`)).toBeVisible();
    await expect(page.getByRole("heading", { name: "Edit Entry" })).toBeVisible();
}

for (const width of MOBILE_WIDTHS) {
    test(`mobile check-in flow and calendar day edit context (${width}px)`, async ({ page }) => {
        await runMobileFlow(width, page);
    });
}
