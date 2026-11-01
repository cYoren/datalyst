import { SubvariableType } from '@/lib/subvariable-types';

// ── Individual Templates ──────────────────────────────────────────

export const HABIT_TEMPLATES = [
    {
        id: 'gym',
        name: 'Gym Workout',
        icon: 'dumbbell',
        color: '#ef4444',
        description: 'Strength training or cardio',
        subvariables: [
            {
                name: 'Duration',
                type: SubvariableType.NUMERIC,
                unit: 'min',
                order: 0,
                metadata: { step: 5 }
            },
            {
                name: 'Effort',
                type: SubvariableType.SCALE_0_10,
                order: 1,
                metadata: { labels: ['Light', 'Exhausting'] }
            },
            {
                name: 'Satisfaction',
                type: SubvariableType.SCALE_0_10,
                order: 2,
                metadata: { labels: ['Poor', 'Great'] }
            }
        ]
    },
    {
        id: 'meditation',
        name: 'Meditation',
        icon: 'meditation',
        color: '#8b5cf6',
        description: 'Mindfulness practice',
        subvariables: [
            {
                name: 'Time',
                type: SubvariableType.NUMERIC,
                unit: 'min',
                order: 0,
                metadata: { step: 1 }
            },
            {
                name: 'Focus',
                type: SubvariableType.SCALE_0_10,
                order: 1,
                metadata: { labels: ['Distracted', 'Focused'] }
            },
            {
                name: 'Post-calm',
                type: SubvariableType.SCALE_0_10,
                order: 2,
                metadata: { labels: ['Restless', 'Zen'] }
            }
        ]
    },
    {
        id: 'sleep',
        name: 'Sleep',
        icon: 'moon',
        color: '#3b82f6',
        description: 'Sleep quality and duration',
        subvariables: [
            {
                name: 'Hours',
                type: SubvariableType.NUMERIC,
                unit: 'h',
                order: 0,
                metadata: { step: 0.5 }
            },
            {
                name: 'Quality',
                type: SubvariableType.SCALE_0_10,
                order: 1,
                metadata: { labels: ['Terrible', 'Excellent'] }
            },
            {
                name: 'Woke up refreshed?',
                type: SubvariableType.BOOLEAN,
                order: 2,
                metadata: {}
            }
        ]
    },
    {
        id: 'reading',
        name: 'Reading',
        icon: 'book',
        color: '#10b981',
        description: 'Reading books or articles',
        subvariables: [
            {
                name: 'Pages',
                type: SubvariableType.NUMERIC,
                unit: 'pages',
                order: 0,
                metadata: { step: 1 }
            },
            {
                name: 'Time',
                type: SubvariableType.NUMERIC,
                unit: 'min',
                order: 1,
                metadata: { step: 5 }
            },
            {
                name: 'Interest',
                type: SubvariableType.SCALE_0_10,
                order: 2,
                metadata: { labels: ['Boring', 'Amazing'] }
            }
        ]
    },
    {
        id: 'caffeine',
        name: 'Caffeine Intake',
        icon: 'coffee',
        color: '#92400e',
        description: 'Track coffee, tea, and caffeine consumption',
        subvariables: [
            { name: 'Cups', type: SubvariableType.NUMERIC, unit: 'cups', order: 0, metadata: { step: 1 } },
            { name: 'Last cup time', type: SubvariableType.NUMERIC, unit: 'h (24h)', order: 1, metadata: { step: 1 } },
            { name: 'Jitters', type: SubvariableType.SCALE_0_10, order: 2, metadata: { labels: ['None', 'Wired'] } }
        ]
    },
    {
        id: 'screen-time',
        name: 'Screen Time',
        icon: 'phone',
        color: '#6366f1',
        description: 'Track daily screen usage',
        subvariables: [
            { name: 'Hours', type: SubvariableType.NUMERIC, unit: 'h', order: 0, metadata: { step: 0.5 } },
            { name: 'Before bed?', type: SubvariableType.BOOLEAN, order: 1, metadata: {} }
        ]
    },
    {
        id: 'deep-work',
        name: 'Deep Work',
        icon: 'target',
        color: '#0891b2',
        description: 'Focused work sessions without distractions',
        subvariables: [
            { name: 'Hours', type: SubvariableType.NUMERIC, unit: 'h', order: 0, metadata: { step: 0.5 } },
            { name: 'Focus quality', type: SubvariableType.SCALE_0_10, order: 1, metadata: { labels: ['Scattered', 'Flow state'] } },
            { name: 'Tasks completed', type: SubvariableType.NUMERIC, unit: 'tasks', order: 2, metadata: { step: 1 } }
        ]
    },
    {
        id: 'mood',
        name: 'Mood',
        icon: 'smile',
        color: '#f59e0b',
        description: 'Daily mood and emotional state',
        subvariables: [
            { name: 'Mood', type: SubvariableType.SCALE_0_10, order: 0, metadata: { labels: ['Very low', 'Great'] } },
            { name: 'Anxiety', type: SubvariableType.SCALE_0_10, order: 1, metadata: { labels: ['Calm', 'Very anxious'] } },
            { name: 'Energy', type: SubvariableType.SCALE_0_10, order: 2, metadata: { labels: ['Drained', 'Energized'] } }
        ]
    },
    {
        id: 'exercise',
        name: 'Exercise',
        icon: 'activity',
        color: '#16a34a',
        description: 'Any physical activity',
        subvariables: [
            { name: 'Duration', type: SubvariableType.NUMERIC, unit: 'min', order: 0, metadata: { step: 5 } },
            { name: 'Intensity', type: SubvariableType.SCALE_0_10, order: 1, metadata: { labels: ['Light', 'Max effort'] } },
            { name: 'Enjoyment', type: SubvariableType.SCALE_0_10, order: 2, metadata: { labels: ['Dreaded it', 'Loved it'] } }
        ]
    },
    {
        id: 'social',
        name: 'Social Interaction',
        icon: 'users',
        color: '#ec4899',
        description: 'Social connections and interactions',
        subvariables: [
            { name: 'Hours socializing', type: SubvariableType.NUMERIC, unit: 'h', order: 0, metadata: { step: 0.5 } },
            { name: 'Quality', type: SubvariableType.SCALE_0_10, order: 1, metadata: { labels: ['Draining', 'Energizing'] } }
        ]
    },
    {
        id: 'nutrition',
        name: 'Nutrition',
        icon: 'salad',
        color: '#84cc16',
        description: 'Meals and eating habits',
        subvariables: [
            { name: 'Meals', type: SubvariableType.NUMERIC, unit: 'meals', order: 0, metadata: { step: 1 } },
            { name: 'Water', type: SubvariableType.NUMERIC, unit: 'L', order: 1, metadata: { step: 0.25 } },
            { name: 'How healthy?', type: SubvariableType.SCALE_0_10, order: 2, metadata: { labels: ['Junk food', 'Clean eating'] } }
        ]
    },
    {
        id: 'energy',
        name: 'Energy Level',
        icon: 'zap',
        color: '#eab308',
        description: 'Track energy throughout the day',
        subvariables: [
            { name: 'Morning energy', type: SubvariableType.SCALE_0_10, order: 0, metadata: { labels: ['Exhausted', 'Supercharged'] } },
            { name: 'Afternoon energy', type: SubvariableType.SCALE_0_10, order: 1, metadata: { labels: ['Exhausted', 'Supercharged'] } },
            { name: 'Crashed?', type: SubvariableType.BOOLEAN, order: 2, metadata: {} }
        ]
    },
    {
        id: 'soreness',
        name: 'Soreness / Recovery',
        icon: 'bandage',
        color: '#f97316',
        description: 'Post-workout recovery tracking',
        subvariables: [
            { name: 'Soreness', type: SubvariableType.SCALE_0_10, order: 0, metadata: { labels: ['None', 'Can\'t move'] } },
            { name: 'Recovery feel', type: SubvariableType.SCALE_0_10, order: 1, metadata: { labels: ['Wrecked', 'Fully recovered'] } }
        ]
    },
    {
        id: 'learning',
        name: 'Learning Session',
        icon: 'study',
        color: '#7c3aed',
        description: 'Study or skill-building sessions',
        subvariables: [
            { name: 'Duration', type: SubvariableType.NUMERIC, unit: 'min', order: 0, metadata: { step: 5 } },
            { name: 'Retention', type: SubvariableType.SCALE_0_10, order: 1, metadata: { labels: ['Nothing stuck', 'Crystal clear'] } },
            { name: 'Difficulty', type: SubvariableType.SCALE_0_10, order: 2, metadata: { labels: ['Easy', 'Brain-melting'] } }
        ]
    },
    {
        id: 'spending',
        name: 'Daily Spending',
        icon: 'wallet',
        color: '#059669',
        description: 'Track daily expenses',
        subvariables: [
            { name: 'Amount', type: SubvariableType.NUMERIC, unit: '$', order: 0, metadata: { step: 1 } },
            { name: 'Necessary?', type: SubvariableType.BOOLEAN, order: 1, metadata: {} },
            { name: 'Regret', type: SubvariableType.SCALE_0_10, order: 2, metadata: { labels: ['Worth it', 'Total waste'] } }
        ]
    },

    // ── Whole-life trackers ──
    ...lifeTemplates([
        ['headache', 'Headache / Migraine', 'brain', '#dc2626', 'Pain, duration and what came before it',
            [scale('Pain', 'None', 'Worst ever'), num('Duration', 'h', 0.5), yesNo('Took medication?')]],
        ['gut', 'Gut & Digestion', 'gut', '#b45309', 'Bloating, discomfort and bowel changes',
            [scale('Discomfort', 'None', 'Severe'), scale('Bloating', 'None', 'Severe'), yesNo('Normal bowel movement?')]],
        ['pain', 'Body Pain', 'bandage', '#e11d48', 'Joint, back or chronic pain',
            [scale('Pain', 'None', 'Severe'), scale('Stiffness', 'None', 'Severe')]],
        ['stress', 'Stress', 'stress', '#7c3aed', 'How tense or overloaded you felt',
            [scale('Stress', 'Calm', 'Overwhelmed'), yesNo('Big stressor today?')]],
        ['medication', 'Medication & Supplements', 'pill', '#0d9488', 'Did you take what you planned',
            [yesNo('Took it on time?'), num('Doses', 'doses', 1)]],
        ['water', 'Water', 'water', '#0284c7', 'Daily hydration',
            [num('Glasses', 'glasses', 1)]],
        ['alcohol', 'Alcohol', 'wine', '#9f1239', 'Drinks and how you felt after',
            [num('Drinks', 'drinks', 1), scale('Next-day hangover', 'None', 'Rough')]],
        ['weight', 'Body Weight', 'scale', '#475569', 'Morning weight',
            [num('Weight', 'kg', 0.1)]],
        ['steps', 'Steps & Walking', 'steps', '#16a34a', 'Daily movement outside workouts',
            [num('Steps', 'steps', 500), yesNo('Walked outside?')]],
        ['sunlight', 'Sunlight & Outdoors', 'sun', '#ca8a04', 'Time outside, especially in the morning',
            [num('Time outside', 'min', 5), yesNo('Morning light?')]],
        ['cycle', 'Menstrual Cycle', 'cycle', '#db2777', 'Period days, flow and cramps',
            [yesNo('Period today?'), scale('Flow', 'None', 'Heavy'), scale('Cramps', 'None', 'Severe')]],
        ['journal', 'Journal & Gratitude', 'journal', '#4f46e5', 'One line about your day',
            [yesNo('Wrote today?'), scale('Day rating', 'Awful', 'Amazing')]],
        ['family', 'Family & Partner', 'heart', '#be123c', 'Quality time with the people closest to you',
            [num('Quality time', 'min', 15), scale('Connection', 'Distant', 'Close')]],
        ['chores', 'Home & Chores', 'home', '#57534e', 'Keeping the house running',
            [yesNo('Did the daily reset?'), num('Time', 'min', 5)]],
        ['work-hours', 'Work Hours & Income', 'briefcase', '#15803d', 'Hours worked and what they earned',
            [num('Hours worked', 'h', 0.5), num('Earned', '$', 1)]],
        ['hobby', 'Hobby & Creative Time', 'palette', '#c026d3', 'Music, art, side projects, games',
            [num('Time', 'min', 15), scale('Enjoyment', 'Meh', 'Loved it')]],
    ]),
];

type LifeSub = { name: string; type: SubvariableType; unit?: string; metadata: Record<string, unknown> };
function scale(name: string, low: string, high: string): LifeSub {
    return { name, type: SubvariableType.SCALE_0_10, metadata: { labels: [low, high] } };
}
function num(name: string, unit: string, step: number): LifeSub {
    return { name, type: SubvariableType.NUMERIC, unit, metadata: { step } };
}
function yesNo(name: string): LifeSub {
    return { name, type: SubvariableType.BOOLEAN, metadata: {} };
}
function lifeTemplates(rows: [string, string, string, string, string, LifeSub[]][]) {
    return rows.map(([id, name, icon, color, description, subs]) => ({
        id, name, icon, color, description,
        subvariables: subs.map((sub, order) => ({ ...sub, order })),
    }));
}

// ── Protocol Bundles ──────────────────────────────────────────────
// Bundles are sets of 2-3 protocols designed to produce meaningful correlations

export interface ProtocolBundle {
    id: string;
    name: string;
    icon: string;
    description: string;
    whyItCorrelates: string;
    protocolIds: string[]; // references HABIT_TEMPLATES[].id
    focusAreas: string[]; // which onboarding focus areas show this bundle
}

export const PROTOCOL_BUNDLES: ProtocolBundle[] = [
    {
        id: 'sleep-optimization',
        name: 'Sleep Optimization',
        icon: 'moon',
        description: 'Understand what affects your sleep quality',
        whyItCorrelates: 'Caffeine timing and screen exposure are the top 2 sleep disruptors',
        protocolIds: ['sleep', 'caffeine', 'screen-time'],
        focusAreas: ['Physical Health', 'Mental Wellness']
    },
    {
        id: 'workout-recovery',
        name: 'Workout Recovery',
        icon: 'dumbbell',
        description: 'Optimize training and recovery cycles',
        whyItCorrelates: 'Sleep quality directly predicts next-day recovery and performance',
        protocolIds: ['gym', 'sleep', 'soreness'],
        focusAreas: ['Physical Health']
    },
    {
        id: 'focus-productivity',
        name: 'Focus & Productivity',
        icon: 'target',
        description: 'Find what drives your best deep work sessions',
        whyItCorrelates: 'Exercise, sleep, and caffeine form the cognitive performance triangle',
        protocolIds: ['deep-work', 'exercise', 'sleep'],
        focusAreas: ['Productivity']
    },
    {
        id: 'mood-baseline',
        name: 'Mood Baseline',
        icon: 'smile',
        description: 'Discover your mood drivers',
        whyItCorrelates: 'Exercise and social connection are top evidence-based mood boosters',
        protocolIds: ['mood', 'exercise', 'social'],
        focusAreas: ['Mental Wellness']
    },
    {
        id: 'energy-management',
        name: 'Energy Management',
        icon: 'zap',
        description: 'Stop afternoon crashes and feel energized all day',
        whyItCorrelates: 'Energy levels correlate with nutrition timing, sleep, and caffeine patterns',
        protocolIds: ['energy', 'nutrition', 'sleep'],
        focusAreas: ['Physical Health', 'Productivity']
    },
    {
        id: 'learning-performance',
        name: 'Learning Performance',
        icon: 'study',
        description: 'Learn faster by optimizing the conditions',
        whyItCorrelates: 'Sleep and focus quality directly affect memory retention',
        protocolIds: ['learning', 'sleep', 'deep-work'],
        focusAreas: ['Learning']
    },
    {
        id: 'reading-habit',
        name: 'Reading Habit',
        icon: 'book',
        description: 'Build a consistent reading routine',
        whyItCorrelates: 'Screen time competes with reading; energy predicts reading quality',
        protocolIds: ['reading', 'screen-time', 'energy'],
        focusAreas: ['Learning']
    },
    {
        id: 'mindful-wellness',
        name: 'Mindful Wellness',
        icon: 'meditation',
        description: 'Track meditation, mood, and sleep together',
        whyItCorrelates: 'Meditation improves sleep quality and mood. See it in your data',
        protocolIds: ['meditation', 'mood', 'sleep'],
        focusAreas: ['Mental Wellness']
    },
    {
        id: 'spending-awareness',
        name: 'Spending Awareness',
        icon: 'wallet',
        description: 'Find patterns in your spending behavior',
        whyItCorrelates: 'Mood and energy levels predict impulsive spending',
        protocolIds: ['spending', 'mood', 'energy'],
        focusAreas: ['Finance']
    },
    {
        id: 'migraine-triggers',
        name: 'Migraine Triggers',
        icon: 'brain',
        description: 'Find what sets off your headaches',
        whyItCorrelates: 'Sleep, caffeine, alcohol, stress and hydration are the most reported migraine triggers',
        protocolIds: ['headache', 'sleep', 'caffeine', 'stress', 'water'],
        focusAreas: ['Symptoms']
    },
    {
        id: 'gut-triggers',
        name: 'Gut Triggers',
        icon: 'gut',
        description: 'Link what you eat and how you live to how your gut feels',
        whyItCorrelates: 'Meals, stress, alcohol and sleep all move gut symptoms, often a day later',
        protocolIds: ['gut', 'nutrition', 'stress', 'alcohol'],
        focusAreas: ['Symptoms']
    },
    {
        id: 'pain-flares',
        name: 'Pain Flares',
        icon: 'bandage',
        description: 'See what makes chronic pain better or worse',
        whyItCorrelates: 'Movement, sleep and stress predict next-day pain for many people',
        protocolIds: ['pain', 'steps', 'sleep', 'stress'],
        focusAreas: ['Symptoms']
    },
    {
        id: 'cycle-symptoms',
        name: 'Cycle & Symptoms',
        icon: 'cycle',
        description: 'Map mood, energy and pain across your cycle',
        whyItCorrelates: 'Cycle phase shifts mood, energy and cramps in a pattern you can predict',
        protocolIds: ['cycle', 'mood', 'energy', 'pain'],
        focusAreas: ['Symptoms', 'Mental Wellness']
    },
    {
        id: 'daily-basics',
        name: 'Daily Basics',
        icon: 'leaf',
        description: 'The small daily things that run your life',
        whyItCorrelates: 'Water, sunlight, steps and medication on time quietly drive energy and mood',
        protocolIds: ['water', 'sunlight', 'steps', 'medication', 'energy'],
        focusAreas: ['Habits & Life', 'Physical Health']
    },
    {
        id: 'relationships',
        name: 'Relationships',
        icon: 'heart',
        description: 'Notice how your people shape your days',
        whyItCorrelates: 'Time with family and friends is one of the strongest predictors of mood',
        protocolIds: ['family', 'social', 'mood'],
        focusAreas: ['Habits & Life', 'Mental Wellness']
    },
    {
        id: 'life-balance',
        name: 'Life Balance',
        icon: 'scale',
        description: 'Work, home and play in one view',
        whyItCorrelates: 'Long work days crowd out hobbies and home, and stress follows',
        protocolIds: ['work-hours', 'hobby', 'chores', 'stress'],
        focusAreas: ['Habits & Life', 'Finance', 'Productivity']
    },
    {
        id: 'body-composition',
        name: 'Body & Weight',
        icon: 'scale',
        description: 'Weight trends with the habits behind them',
        whyItCorrelates: 'Alcohol, sleep and daily steps explain most day-to-day weight swings',
        protocolIds: ['weight', 'steps', 'alcohol', 'sleep'],
        focusAreas: ['Physical Health']
    },
    {
        id: 'reflection',
        name: 'Reflection',
        icon: 'journal',
        description: 'A one-line diary that turns into insight',
        whyItCorrelates: 'Your day rating next to sleep and stress shows what good days have in common',
        protocolIds: ['journal', 'sleep', 'stress'],
        focusAreas: ['Mental Wellness', 'Habits & Life']
    }
];

export function getBundlesForFocusArea(focusArea: string): ProtocolBundle[] {
    return PROTOCOL_BUNDLES.filter(b => b.focusAreas.includes(focusArea));
}

export function getTemplateById(id: string) {
    return HABIT_TEMPLATES.find(t => t.id === id);
}

