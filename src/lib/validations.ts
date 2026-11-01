import { z } from 'zod';

// User validation schemas
export const createUserSchema = z.object({
    email: z.string().email('Invalid email'),
    passwordHash: z.string().optional(),
    timezone: z.string().default('UTC'),
    locale: z.string().default('en-US'),
    theme: z.enum(['LIGHT', 'DARK', 'SYSTEM']).default('SYSTEM'),
});

// Habit validation schemas
export const createHabitSchema = z.object({
    name: z.string().min(1, 'Name is required').max(100, 'Name too long'),
    description: z.string().max(500, 'Description too long').optional(),
    color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Invalid color').default('#3b82f6'),
    icon: z.string().default('target'),
    // New Protocol Rules fields
    scheduleType: z.enum(['DAILY', 'WEEKLY', 'ADHOC']).default('DAILY'),
    scheduleDays: z.array(z.number().min(0).max(6)).default([]), // 0=Sunday...6=Saturday
    timeBlock: z.enum(['MORNING', 'AFTERNOON', 'EVENING', 'ANYTIME']).default('ANYTIME'),
    // Legacy (backward compat)
    schedule: z.object({
        daysOfWeek: z.array(z.number().min(0).max(6)).optional(),
        frequency: z.enum(['daily', 'weekly', 'custom']).optional(),
    }).optional(),
});

export const updateHabitSchema = createHabitSchema.partial();

// Subvariable validation schemas
export const createSubvariableSchema = z.object({
    habitId: z.string().cuid(),
    name: z.string().min(1, 'Name is required').max(100),
    type: z.enum(['NUMERIC', 'SCALE_0_10', 'BOOLEAN', 'CATEGORY']),
    unit: z.string().max(50).optional(),
    prompt: z.string().max(200).optional().nullable(),
    goalDirection: z.enum(['HIGHER_BETTER', 'LOWER_BETTER', 'NEUTRAL']).default('NEUTRAL'),
    metadata: z.record(z.string(), z.unknown()).optional(),
    order: z.number().int().min(0).default(0),
});

// Entry validation schemas
export const createEntrySchema = z.object({
    habitId: z.string().cuid(),
    logicalDate: z.string().datetime(), // ISO 8601
    timestamp: z.string().datetime().optional(), // Optional, defaults to now
    note: z.string().max(1000).optional(),
    subvariableEntries: z.array(
        z.object({
            subvariableId: z.string().cuid(),
            numericValue: z.number(),
            rawValue: z.string().optional(),
        })
    ).min(1, 'At least one subvariable entry is required'),
});

export const updateEntrySchema = z.object({
    logicalDate: z.string().datetime().optional(),
    note: z.string().max(1000).optional(),
    subvariableEntries: z.array(
        z.object({
            subvariableId: z.string().cuid(),
            numericValue: z.number(),
            rawValue: z.string().optional(),
        })
    ).optional(),
});

// Check-in quick entry (one variable, one day). Used by the app and MCP.
export const quickEntrySchema = z.object({
    habitId: z.string().min(1),
    subvariableId: z.string().min(1),
    numericValue: z.number(),
    rawValue: z.string().optional(),
    logicalDate: z.iso.date(),  // Real YYYY-MM-DD calendar date
    followedAssignment: z.boolean().optional(), // N=1 compliance tracking
    note: z.string().max(500).optional(),
});

// Session log schema
export const createSessionSchema = z.object({
    origin: z.string().default('web'),
    duration: z.number().int().min(0).optional(),
});

// Date range schema for queries
export const dateRangeSchema = z.object({
    startDate: z.string().datetime(),
    endDate: z.string().datetime(),
});

// Experiment validation schema
// A real calendar day: rejects 2026-02-31, which Date would silently roll into March.
const calendarDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format (YYYY-MM-DD)')
    .refine((value) => {
        const date = new Date(`${value}T00:00:00Z`);
        return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
    }, 'Invalid calendar date');

export const experimentFormSchema = z.object({
    name: z.string().min(1, 'Name is required').max(200, 'Name too long'),
    hypothesis: z.string().max(1000).optional().nullable(),
    independentId: z.string().cuid('Invalid variable ID'),
    dependentId: z.string().cuid('Invalid variable ID'),
    startDate: calendarDate,
    endDate: calendarDate,
    status: z.enum(['PLANNING', 'ACTIVE', 'COMPLETED', 'ARCHIVED']).default('PLANNING'),

    // N=1 fields
    type: z.enum(['OBSERVATIONAL', 'RANDOMIZED', 'BLIND_RCT']).default('OBSERVATIONAL'),
    randomizationType: z.enum(['SIMPLE', 'BLOCKED']).default('BLOCKED'),
    washoutPeriod: z.number().int().min(0).max(10).default(2),
    blockSize: z.number().int().min(2).max(24).default(4),
    isBlind: z.boolean().default(false),
    conditions: z.array(z.object({
        label: z.string().min(1).max(20),
        dose: z.number().optional(),
        description: z.string().max(200).optional(),
    })).min(2).max(8).default([{ label: 'A' }, { label: 'B' }]),
}).refine(
    (data) => {
        if (data.type === 'OBSERVATIONAL') return true;
        return data.blockSize % data.conditions.length === 0;
    },
    { message: 'Block size must be a multiple of the number of conditions', path: ['blockSize'] }
).refine(
    (data) => data.independentId !== data.dependentId,
    { message: 'Independent and dependent variables must be different', path: ['dependentId'] }
).refine(
    (data) => {
        const start = new Date(data.startDate);
        const end = new Date(data.endDate);
        return end > start;
    },
    { message: 'End date must be after start date', path: ['endDate'] }
).refine(
    (data) => {
        const start = new Date(data.startDate);
        const end = new Date(data.endDate);
        const daysDiff = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
        return daysDiff >= 7;
    },
    { message: 'Experiment must be at least 7 days long', path: ['endDate'] }
);

export const updateExperimentSchema = experimentFormSchema.partial().omit({ independentId: true, dependentId: true });
