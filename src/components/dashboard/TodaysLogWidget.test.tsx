import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { TodaysLogWidget } from "@/components/dashboard/TodaysLogWidget";
import * as todaysLogHook from "@/lib/useTodaysLog";
import * as haptics from "@/lib/haptics";

type UseTodaysLogReturn = ReturnType<typeof todaysLogHook.useTodaysLog>;
type LogVariableFn = UseTodaysLogReturn["logVariable"];

const baseVariable = {
    id: "sv_sleep",
    name: "Sleep quality",
    type: "BOOLEAN" as const,
    habitId: "habit_sleep",
    habitName: "Sleep Tracker",
    habitIcon: "😴",
    habitColor: "#0ea5a4",
    timeBlock: "MORNING" as const,
    rank: 0,
};

describe("TodaysLogWidget", () => {
    const logVariable = vi.fn<LogVariableFn>();

    beforeEach(() => {
        vi.spyOn(haptics, "triggerSelectionHaptic").mockResolvedValue();
        vi.spyOn(haptics, "triggerSuccessHaptic").mockResolvedValue();

        logVariable.mockReset();
        logVariable.mockResolvedValue(true);

        vi.spyOn(todaysLogHook, "useTodaysLog").mockReturnValue({
            summary: {
                variables: [baseVariable],
                logged: 0,
                total: 1,
                percentage: 0,
            },
            isLoading: false,
            isError: false,
            lastError: null,
            logVariable,
            pendingSync: 0,
            refresh: vi.fn(),
            clearLastError: vi.fn(),
        });
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("opens and closes advanced actions inline", async () => {
        const user = userEvent.setup();
        render(<TodaysLogWidget />);

        const advancedButton = screen.getByRole("button", { name: /advanced actions/i });
        expect(screen.queryByLabelText("Date")).not.toBeInTheDocument();

        await user.click(advancedButton);
        expect(screen.getByLabelText("Date")).toBeInTheDocument();

        await user.click(advancedButton);
        expect(screen.queryByLabelText("Date")).not.toBeInTheDocument();
    });

    it("saves the next tapped value with the advanced date and trimmed note", async () => {
        const user = userEvent.setup();
        render(<TodaysLogWidget />);

        await user.click(screen.getByRole("button", { name: /advanced actions/i }));

        fireEvent.change(screen.getByLabelText("Date"), {
            target: { value: "2026-03-01" },
        });
        fireEvent.change(screen.getByLabelText(/note \(optional\)/i), {
            target: { value: "   focused session   " },
        });

        await user.click(screen.getByRole("button", { name: /set sleep quality to no/i }));

        await waitFor(() => expect(logVariable).toHaveBeenCalledTimes(1));
        expect(logVariable).toHaveBeenCalledWith(
            "habit_sleep",
            "sv_sleep",
            0,
            expect.objectContaining({
                rawValue: "No",
                logicalDate: "2026-03-01",
                note: "focused session",
            })
        );
    });

    it("never saves an empty number as 0", async () => {
        vi.mocked(todaysLogHook.useTodaysLog).mockReturnValue({
            ...todaysLogHook.useTodaysLog(),
            summary: {
                variables: [{ ...baseVariable, id: "sv_hours", name: "Hours slept", type: "NUMERIC" as const }],
                logged: 0,
                total: 1,
                percentage: 0,
            },
        });
        const user = userEvent.setup();
        render(<TodaysLogWidget />);

        const save = screen.getByRole("button", { name: "Save" });
        expect(save).toBeDisabled();

        await user.type(screen.getByLabelText("Hours slept value"), "7,5");
        await user.click(save);
        await waitFor(() => expect(logVariable).toHaveBeenCalledWith(
            "habit_sleep", "sv_hours", 7.5, expect.anything()
        ));
    });

    it("saves a 0-10 scale with one tap and no preset value", async () => {
        vi.mocked(todaysLogHook.useTodaysLog).mockReturnValue({
            ...todaysLogHook.useTodaysLog(),
            summary: {
                variables: [{ ...baseVariable, id: "sv_energy", name: "Energy", type: "SCALE_0_10" as const }],
                logged: 0,
                total: 1,
                percentage: 0,
            },
        });
        const user = userEvent.setup();
        render(<TodaysLogWidget />);

        expect(screen.queryByRole("button", { pressed: true })).not.toBeInTheDocument();
        await user.click(screen.getByRole("button", { name: "Set Energy to 7" }));
        await waitFor(() => expect(logVariable).toHaveBeenCalledWith(
            "habit_sleep", "sv_energy", 7, expect.anything()
        ));
    });

    it("folds down once every variable is logged", () => {
        vi.mocked(todaysLogHook.useTodaysLog).mockReturnValue({
            ...todaysLogHook.useTodaysLog(),
            summary: {
                variables: [{ ...baseVariable, todayEntry: { entryId: "e", subvariableEntryId: "s", numericValue: 1, rawValue: "Yes" } }],
                logged: 1,
                total: 1,
                percentage: 100,
            },
        });
        render(<TodaysLogWidget />);

        expect(screen.getByText(/all done for today/i)).toBeInTheDocument();
        expect(screen.queryByTestId("daily-checkin-list")).not.toBeInTheDocument();
        expect(screen.getByRole("link", { name: /see how today compares/i })).toHaveAttribute("href", "/data");
    });

    it("uses page-level mobile list classes (no nested scroll on small screens)", () => {
        render(<TodaysLogWidget />);

        const list = screen.getByTestId("daily-checkin-list");
        expect(list.className).toContain("max-h-none");
        expect(list.className).toContain("overflow-visible");
        expect(list.className).toContain("sm:max-h-[60vh]");
        expect(list.className).toContain("sm:overflow-y-auto");
    });
});
