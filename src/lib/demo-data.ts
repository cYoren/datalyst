/**
 * Demo Data Generator
 * Creates realistic sample protocols and entries for new users to experience
 * the platform's capabilities immediately.
 */

import { SubvariableType, GoalDirection, ScheduleType, TimeBlock } from '@prisma/client';

// Demo protocols with correlated data
export const DEMO_PROTOCOLS = [
    {
        name: 'Sleep Tracker',
        icon: 'moon',
        color: '#3b82f6',
        description: 'Track sleep quality and duration',
        scheduleType: ScheduleType.DAILY,
        timeBlock: TimeBlock.MORNING,
        subvariables: [
            {
                name: 'Hours Slept',
                type: SubvariableType.NUMERIC,
                unit: 'h',
                goalDirection: GoalDirection.HIGHER_BETTER,
                metadata: { step: 0.5 }
            },
            {
                name: 'Sleep Quality',
                type: SubvariableType.SCALE_0_10,
                goalDirection: GoalDirection.HIGHER_BETTER,
                metadata: { labels: ['Terrible', 'Excellent'] }
            },
            {
                name: 'Screen Time Before Bed',
                type: SubvariableType.NUMERIC,
                unit: 'min',
                goalDirection: GoalDirection.LOWER_BETTER,
                metadata: { step: 15 }
            }
        ]
    },
    {
        name: 'Workout Log',
        icon: 'dumbbell',
        color: '#ef4444',
        description: 'Track exercise and physical activity',
        scheduleType: ScheduleType.DAILY,
        timeBlock: TimeBlock.ANYTIME,
        subvariables: [
            {
                name: 'Duration',
                type: SubvariableType.NUMERIC,
                unit: 'min',
                goalDirection: GoalDirection.HIGHER_BETTER,
                metadata: { step: 5 }
            },
            {
                name: 'Intensity',
                type: SubvariableType.SCALE_0_10,
                goalDirection: GoalDirection.NEUTRAL,
                metadata: { labels: ['Light', 'Intense'] }
            },
            {
                name: 'Did Workout?',
                type: SubvariableType.BOOLEAN,
                goalDirection: GoalDirection.HIGHER_BETTER,
                metadata: {}
            }
        ]
    },
    {
        name: 'Mood & Energy',
        icon: 'zap',
        color: '#f59e0b',
        description: 'Daily mood and energy levels',
        scheduleType: ScheduleType.DAILY,
        timeBlock: TimeBlock.EVENING,
        subvariables: [
            {
                name: 'Energy Level',
                type: SubvariableType.SCALE_0_10,
                goalDirection: GoalDirection.HIGHER_BETTER,
                metadata: { labels: ['Exhausted', 'Energized'] }
            },
            {
                name: 'Mood',
                type: SubvariableType.SCALE_0_10,
                goalDirection: GoalDirection.HIGHER_BETTER,
                metadata: { labels: ['Low', 'Great'] }
            },
            {
                name: 'Stress Level',
                type: SubvariableType.SCALE_0_10,
                goalDirection: GoalDirection.LOWER_BETTER,
                metadata: { labels: ['Calm', 'Stressed'] }
            }
        ]
    },
    {
        name: 'Focus & Productivity',
        icon: 'target',
        color: '#8b5cf6',
        description: 'Track focus and deep work sessions',
        scheduleType: ScheduleType.DAILY,
        timeBlock: TimeBlock.AFTERNOON,
        subvariables: [
            {
                name: 'Deep Work Hours',
                type: SubvariableType.NUMERIC,
                unit: 'h',
                goalDirection: GoalDirection.HIGHER_BETTER,
                metadata: { step: 0.5 }
            },
            {
                name: 'Focus Quality',
                type: SubvariableType.SCALE_0_10,
                goalDirection: GoalDirection.HIGHER_BETTER,
                metadata: { labels: ['Distracted', 'Focused'] }
            },
            {
                name: 'Caffeine Intake',
                type: SubvariableType.NUMERIC,
                unit: 'mg',
                goalDirection: GoalDirection.NEUTRAL,
                metadata: { step: 50 }
            }
        ]
    }
];

/**
 * Generate 30 days of correlated mock data
 * Creates meaningful correlations:
 * - Better sleep → Higher energy/mood
 * - Less screen time → Better sleep quality
 * - Exercise → Better mood, lower stress
 * - Moderate caffeine → Better focus (but diminishing returns)
 */
export function generateMockEntries(daysBack: number = 30): MockEntry[] {
    const entries: MockEntry[] = [];
    const now = new Date();

    for (let d = daysBack; d >= 0; d--) {
        const date = new Date(now);
        date.setDate(date.getDate() - d);
        const dateStr = date.toISOString().split('T')[0];

        // Base variations for each day
        const dayOfWeek = date.getDay();
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

        // Generate correlated data
        const screenTime = randomBetween(isWeekend ? 30 : 45, isWeekend ? 90 : 120);
        const sleepHours = randomBetween(5, 9) - (screenTime > 60 ? 1 : 0);
        const sleepQuality = Math.min(10, Math.max(1,
            sleepHours * 1.1 - (screenTime / 30) + randomBetween(-1, 1)
        ));

        const didWorkout = Math.random() > (isWeekend ? 0.4 : 0.5);
        const workoutDuration = didWorkout ? randomBetween(20, 60) : 0;
        const workoutIntensity = didWorkout ? randomBetween(4, 9) : 0;

        const energyLevel = Math.min(10, Math.max(1,
            (sleepQuality * 0.6) + (didWorkout ? 2 : 0) + randomBetween(-1, 1)
        ));
        const mood = Math.min(10, Math.max(1,
            (sleepQuality * 0.4) + (didWorkout ? 1.5 : 0) + energyLevel * 0.3 + randomBetween(-1, 1)
        ));
        const stress = Math.max(1, Math.min(10,
            10 - mood * 0.5 - (didWorkout ? 1.5 : 0) + randomBetween(-1, 1)
        ));

        const caffeine = randomBetween(0, 400);
        const deepWorkHours = randomBetween(1, 5) + (caffeine > 100 && caffeine < 300 ? 1 : 0);
        const focusQuality = Math.min(10, Math.max(1,
            (sleepQuality * 0.5) + (deepWorkHours * 0.5) + (caffeine > 100 && caffeine < 300 ? 1 : -0.5) + randomBetween(-1, 1)
        ));

        // Sleep Tracker entries
        entries.push({
            protocolIdx: 0,
            logicalDate: dateStr,
            values: [
                { subvariableIdx: 0, value: round(sleepHours, 1) },
                { subvariableIdx: 1, value: round(sleepQuality, 0) },
                { subvariableIdx: 2, value: round(screenTime, 0) }
            ]
        });

        // Workout Log entries
        entries.push({
            protocolIdx: 1,
            logicalDate: dateStr,
            values: [
                { subvariableIdx: 0, value: workoutDuration },
                { subvariableIdx: 1, value: workoutIntensity },
                { subvariableIdx: 2, value: didWorkout ? 1 : 0 }
            ]
        });

        // Mood & Energy entries
        entries.push({
            protocolIdx: 2,
            logicalDate: dateStr,
            values: [
                { subvariableIdx: 0, value: round(energyLevel, 0) },
                { subvariableIdx: 1, value: round(mood, 0) },
                { subvariableIdx: 2, value: round(stress, 0) }
            ]
        });

        // Focus & Productivity entries
        entries.push({
            protocolIdx: 3,
            logicalDate: dateStr,
            values: [
                { subvariableIdx: 0, value: round(deepWorkHours, 1) },
                { subvariableIdx: 1, value: round(focusQuality, 0) },
                { subvariableIdx: 2, value: caffeine }
            ]
        });
    }

    return entries;
}

interface MockEntry {
    protocolIdx: number;
    logicalDate: string;
    values: { subvariableIdx: number; value: number }[];
}

function randomBetween(min: number, max: number): number {
    return Math.random() * (max - min) + min;
}

function round(value: number, decimals: number): number {
    return Math.round(value * Math.pow(10, decimals)) / Math.pow(10, decimals);
}

// Example correlations that will be discovered:
export const EXPECTED_CORRELATIONS = [
    { a: 'Sleep Quality', b: 'Energy Level', direction: 'positive', strength: 'strong' },
    { a: 'Screen Time Before Bed', b: 'Sleep Quality', direction: 'negative', strength: 'moderate' },
    { a: 'Did Workout?', b: 'Mood', direction: 'positive', strength: 'moderate' },
    { a: 'Did Workout?', b: 'Stress Level', direction: 'negative', strength: 'moderate' },
    { a: 'Sleep Quality', b: 'Focus Quality', direction: 'positive', strength: 'moderate' },
    { a: 'Hours Slept', b: 'Energy Level', direction: 'positive', strength: 'moderate' }
];
