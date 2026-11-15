/**
 * The experiment templates the Lab offers to someone with no experiment yet.
 *
 * A template used to link to `/lab/new?template=caffeine`, and that form ignored
 * the parameter: it opened empty, listing whatever trackers the person already
 * had (`ROADMAP.md` A2). A template now says exactly what it needs, so the page
 * can create the missing trackers, fill the form and leave one decision — when
 * to start.
 */

export interface TemplateTracker {
    /** A `HABIT_TEMPLATES` id, so the tracker definition is not duplicated. */
    templateId: string;
    /** The tracker name this flow looks for before creating one. */
    name: string;
}

export interface ExperimentStartTemplate {
    id: string;
    title: string;
    question: string;
    /** What the experiment alternates. */
    independent: TemplateTracker;
    dependent: TemplateTracker;
    days: number;
    explanation: string;
}

export const EXPERIMENT_TEMPLATES: ExperimentStartTemplate[] = [
    {
        id: 'caffeine',
        title: 'Caffeine → Focus',
        question: 'Does caffeine change how well I focus?',
        independent: { templateId: 'caffeine', name: 'Caffeine' },
        dependent: { templateId: 'deep-work', name: 'Deep Work' },
        days: 14,
        explanation:
            'On caffeine days you drink your coffee as usual; on the others you skip it. Datalyst fills each six-day block with three of each and shuffles the order, so a run of good days cannot pass for an effect.',
    },
    {
        id: 'sleep',
        title: 'Sleep Duration → Mood',
        question: 'Does more sleep improve my mood?',
        independent: { templateId: 'sleep', name: 'Sleep' },
        dependent: { templateId: 'mood', name: 'Mood' },
        days: 21,
        explanation:
            'A short-sleep night and a normal one, three of each per six-day block in random order, with mood logged on both.',
    },
    {
        id: 'exercise',
        title: 'Exercise → Energy',
        question: 'Does exercise give me more energy the day after?',
        independent: { templateId: 'exercise', name: 'Exercise' },
        dependent: { templateId: 'energy', name: 'Energy Level' },
        days: 14,
        explanation:
            'Training days and rest days come three of each per six-day block, in random order. Energy is logged every day.',
    },
];

export function experimentTemplateById(id: string | null | undefined): ExperimentStartTemplate | undefined {
    if (!id) return undefined;
    return EXPERIMENT_TEMPLATES.find((template) => template.id === id);
}

/**
 * A condition label the schema accepts (`max 20`), cut on a word boundary so
 * "No headache / migraine" does not become "No headache / migra".
 */
export const MAX_CONDITION_LABEL = 20;

export function conditionLabel(text: string): string {
    if (text.length <= MAX_CONDITION_LABEL) return text;
    const cut = text.slice(0, MAX_CONDITION_LABEL);
    const space = cut.lastIndexOf(' ');
    return (space > 0 ? cut.slice(0, space) : cut).trim();
}
