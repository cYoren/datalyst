/**
 * Condition pages for the website.
 *
 * Each page answers the question a person actually types before installing a
 * tracker ("migraine diary app", "POTS symptom tracker", "IBS food and symptom
 * log", "menopause symptom tracker") and is honest about what a self-tracked
 * correlation can and cannot tell you. No diagnosis, no treatment claim: the
 * product records and compares, the clinician decides.
 *
 * Add a condition: one object here, one date in the sitemap.
 */

export type ConditionFaq = { q: string; a: string };

export type Condition = {
    slug: string;
    name: string;
    /** Short label used in navigation and cards. */
    short: string;
    eyebrow: string;
    /** One-sentence answer to "what is this page about". */
    summary: string;
    intro: string[];
    /** What to log, and why that field matters. */
    log: { label: string; detail: string }[];
    /** What the charts can show, phrased as patterns, never as causes. */
    patterns: string[];
    /** What the data cannot tell you. Kept explicit on purpose. */
    limits: string[];
    faq: ConditionFaq[];
    updated: string;
};

export const CONDITIONS: Condition[] = [
    {
        slug: 'migraine',
        name: 'Migraine',
        short: 'Migraine',
        eyebrow: 'Headache diary',
        summary: 'Log headache days, sleep and the usual suspects, then see which ones line up with your attacks instead of guessing.',
        intro: [
            'A migraine diary is the standard thing clinicians ask for, and it is also the thing almost nobody keeps for more than a week. Paper gets lost, apps ask forty questions, and the record ends up with three entries from the worst day of the month.',
            'Datalyst keeps the log small: how you slept, what you drank and ate that you care about, how you felt, and whether there was a headache. The point is not a perfect record. The point is enough days in a row that a pattern can show up.',
        ],
        log: [
            { label: 'Headache and severity', detail: 'A yes or no is not enough. Severity is what separates a bad afternoon from an attack that cost you the day.' },
            { label: 'Sleep hours and quality', detail: 'Short and long sleep both show up in migraine reports. Log the number and how rested you felt.' },
            { label: 'Caffeine and alcohol', detail: 'Both are common reported triggers, and both are easy to forget by the time the headache arrives.' },
            { label: 'Meals and hydration', detail: 'Skipped meals and low fluid intake are reported often enough to be worth a field.' },
            { label: 'Stress and screen time', detail: 'Two things people notice after the fact. Logging them daily turns "I think it was stress" into something countable.' },
            { label: 'Acute medication', detail: 'What you took and when. Frequent use is itself a clinical question a clinician will ask about.' },
        ],
        patterns: [
            'Which nights of short sleep come before a headache day, and which do not.',
            'Whether headache days cluster after days with more caffeine than usual.',
            'How often a stressful day is followed by an attack the next morning.',
            'Whether your month has a shape at all, or the attacks are scattered.',
        ],
        limits: [
            'A correlation in your own log is a question for your clinician, not an answer.',
            'Removing a food or a habit based on a hunch can cost you something real, especially if the substitute is worse.',
            'This is not a diagnosis. Migraine has criteria, and so do the conditions that look like it.',
        ],
        faq: [
            { q: 'Do I need to log every single day?', a: 'The more complete the record, the more the comparison means. A check-in takes under a minute, and the days without a headache are as informative as the days with one.' },
            { q: 'Which triggers does the app look for?', a: 'The ones you log. Datalyst compares your own fields against your own symptom days; it does not come with a fixed list of suspected triggers for everyone.' },
            { q: 'Can this replace a paper diary?', a: 'It can if it is what you will actually keep. The format matters less than the number of consecutive days in the record.' },
        ],
        updated: '2026-11-09',
    },
    {
        slug: 'pots',
        name: 'POTS and orthostatic symptoms',
        short: 'POTS',
        eyebrow: 'Heart rate and symptoms',
        summary: 'Track standing heart rate, fluid, salt and how you felt upright, so an appointment starts from data instead of a vague month.',
        intro: [
            'Postural orthostatic tachycardia syndrome is diagnosed by a clinician, usually with orthostatic vitals or a tilt table test. What gets people to that appointment is often a month of vague memory: dizzy sometimes, worse in the morning, maybe after a hot shower.',
            'A log that keeps resting and standing heart rate next to symptoms converts that memory into something a clinician can read in a minute. It does not make the diagnosis. It shortens the path to the conversation.',
        ],
        log: [
            { label: 'Resting heart rate', detail: 'Taken lying or seated after a few minutes, so standing values have something to be compared against.' },
            { label: 'Standing heart rate', detail: 'A reading after standing for a set time, plus how you felt at that moment.' },
            { label: 'Fluids and salt', detail: 'The two things people with orthostatic symptoms are usually asked about, and the two most often estimated badly.' },
            { label: 'Dizziness, palpitations, presyncope', detail: 'Severity and timing matter more than the word used.' },
            { label: 'Activity and heat', detail: 'Exercise, standing jobs, hot days and hot showers change the picture.' },
            { label: 'Sleep and meals', detail: 'Morning symptoms and post-meal symptoms are a common pattern worth having documented.' },
        ],
        patterns: [
            'How often a standing heart rate rise lands on the same day as dizziness.',
            'Whether symptoms are worse on days with less fluid or fewer meals.',
            'Whether the hard days cluster after exertion or heat.',
            'Which part of the day your symptoms actually happen, instead of "all the time".',
        ],
        limits: [
            'Datalyst does not diagnose POTS or any other condition, and it does not read your vitals for you.',
            'A wearable reading is not a clinical measurement. Bring the numbers to a clinician rather than acting on them alone.',
            'Fainting, chest pain or a racing heart that does not settle needs medical attention, not a log.',
        ],
        faq: [
            { q: 'Where do the heart rate numbers come from?', a: 'From what you log, or from a wearable you already use. Datalyst compares the values you record; it does not measure your pulse itself.' },
            { q: 'How long before a pattern is visible?', a: 'With one check-in a day, two to three weeks is usually enough to see whether symptom days share anything. Longer records are better for rare events.' },
            { q: 'Is this useful if I already have a diagnosis?', a: 'That is the most common use: tracking how sleep, fluid, salt and activity relate to how you feel, and bringing a month of it to a follow-up.' },
        ],
        updated: '2026-11-09',
    },
    {
        slug: 'ibs',
        name: 'IBS and digestive symptoms',
        short: 'IBS',
        eyebrow: 'Food and symptom log',
        summary: 'Keep meals, stress and stool changes in one timeline so the next conversation about your gut starts from a record.',
        intro: [
            'Digestive symptoms are hard to reason about from memory because the lag is long. A meal can show up a day later, which is exactly the interval where recall stops being reliable.',
            'Datalyst puts meals, stress, sleep and symptoms on the same day grid, so a reaction that arrives 24 hours later still has a visible cause candidate. It is a record to think with, not a verdict about which food is guilty.',
        ],
        log: [
            { label: 'Meals worth noting', detail: 'You do not need to log everything. Log the meals you suspect, plus a normal day here and there as a baseline.' },
            { label: 'Abdominal pain and bloating', detail: 'Severity and time of day, so a late reaction is visible instead of being credited to the wrong meal.' },
            { label: 'Stool frequency and form', detail: 'Bristol scale if you use it. Form changes are part of how clinicians classify the picture.' },
            { label: 'Stress and sleep', detail: 'Both track closely with gut symptoms, and both are easy to under-report from memory.' },
            { label: 'Fiber, caffeine, alcohol', detail: 'Common inputs people change by guesswork. Better to change one thing with a record behind it.' },
        ],
        patterns: [
            'Whether pain days follow specific meals by a consistent interval.',
            'How much of the variation tracks stress and sleep rather than food.',
            'Whether symptoms cluster in a part of the day or after a specific meal size.',
            'What changed in the weeks after you altered one thing, compared with the weeks before.',
        ],
        limits: [
            'Datalyst does not identify food intolerances, allergies or coeliac disease. Those need testing, not a log.',
            'Cutting foods out one by one without supervision can leave you with a narrower diet and the same symptoms.',
            'Red flags such as blood, weight loss, fever or waking at night with pain belong in a consultation, not a chart.',
        ],
        faq: [
            { q: 'Do I have to log every meal?', a: 'No. Log what you suspect and a sample of ordinary days. A record with gaps is still useful if the days you did log are honest.' },
            { q: 'Can the app tell me which food causes my symptoms?', a: 'No. It shows which days line up. Turning that into a decision, especially a restrictive one, is a clinical and dietetic question.' },
            { q: 'Does it work with the low FODMAP approach?', a: 'It can hold the record of the trial, including the reintroduction phase, which is the part most people lose track of.' },
        ],
        updated: '2026-11-09',
    },
    {
        slug: 'menopause',
        name: 'Menopause and perimenopause',
        short: 'Menopause',
        eyebrow: 'Symptom and cycle log',
        summary: 'Track hot flushes, sleep, mood and cycle changes across months, where memory is least reliable and variability is the rule.',
        intro: [
            'Perimenopause is defined by change over time, which makes it one of the worst things to assess from a single appointment and a good month. Symptoms come and go, cycles stretch and shorten, and sleep does its own thing.',
            'A log that runs for months shows the shape: whether flushes are getting more frequent, whether sleep got worse before or after the cycle changed, whether the week you feel worst has a pattern. That is the kind of record a clinician can use.',
        ],
        log: [
            { label: 'Hot flushes and night sweats', detail: 'Count and severity, because frequency is what treatment decisions turn on.' },
            { label: 'Sleep', detail: 'Hours and wakings. Night sweats and insomnia are separate problems that look the same in the morning.' },
            { label: 'Mood and anxiety', detail: 'Daily rating, so a bad week can be compared with the weeks around it.' },
            { label: 'Cycle timing and flow', detail: 'Even irregular cycles are data when the dates are written down.' },
            { label: 'Treatment and supplements', detail: 'What you take, when you started, and what changed afterwards.' },
            { label: 'Exercise, alcohol, caffeine', detail: 'Common modifiers of flushes and sleep that are hard to recall accurately.' },
        ],
        patterns: [
            'Whether flushes are increasing, stable or fading over a period of months.',
            'How sleep and mood moved when the cycle pattern changed.',
            'What happened in the weeks after starting, stopping or changing a treatment.',
            'Which days of the month you actually feel worst.',
        ],
        limits: [
            'Datalyst does not diagnose perimenopause and does not recommend or adjust hormone therapy.',
            'A log cannot replace blood tests, and for perimenopause the tests are often less informative than the history.',
            'Bleeding between periods or after menopause needs a clinician, not an entry in an app.',
        ],
        faq: [
            { q: 'How long should I track before it is useful?', a: 'Two cycles, or about eight weeks, is usually enough to see the shape. Longer records make trends clearer, especially for sleep and mood.' },
            { q: 'Can I use it alongside hormone therapy?', a: 'Yes. Logging the start date and dose changes is one of the more useful things the record can show at a follow-up.' },
            { q: 'Does it handle irregular cycles?', a: 'It records the dates you log, irregular or not. The chart shows intervals, so stretching and shortening are visible rather than averaged away.' },
        ],
        updated: '2026-11-09',
    },
];

export function listConditions(): Condition[] {
    return CONDITIONS;
}

export function getCondition(slug: string): Condition | undefined {
    return CONDITIONS.find((condition) => condition.slug === slug.toLowerCase());
}

export function conditionPath(condition: Condition): string {
    return `/conditions/${condition.slug}`;
}
