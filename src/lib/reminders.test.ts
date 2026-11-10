import { describe, expect, it } from 'vitest';
import { forgetReminder, reminderDates } from './reminders';

describe('reminderDates', () => {
    const morning = new Date(2026, 8, 24, 9, 0);

    it('starts today when the time is still ahead and the day is not done', () => {
        const dates = reminderDates(morning, '20:00', false, 3);
        expect(dates.map((d) => [d.getDate(), d.getHours()])).toEqual([[24, 20], [25, 20], [26, 20]]);
    });

    it('skips today once the check-in is complete', () => {
        expect(reminderDates(morning, '20:00', true, 2)[0].getDate()).toBe(25);
    });

    it('skips today when the time has passed', () => {
        expect(reminderDates(morning, '08:30', false, 1)[0].getDate()).toBe(25);
    });

    it('crosses month ends', () => {
        const dates = reminderDates(new Date(2026, 8, 30, 21, 0), '20:00', false, 2);
        expect(dates.map((d) => [d.getMonth(), d.getDate()])).toEqual([[9, 1], [9, 2]]);
    });
});

describe('forgetReminder', () => {
    it('removes the local reminder preference and does not throw on the web', async () => {
        window.localStorage.setItem('datalyst:reminder-v1', JSON.stringify({ enabled: true, time: '20:00', count: 3 }));
        await forgetReminder();
        expect(window.localStorage.getItem('datalyst:reminder-v1')).toBeNull();
    });
});

