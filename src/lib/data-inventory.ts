/**
 * What we store, said plainly (`ROADMAP.md` A6).
 *
 * Settings lists this inventory and links to `/privacy` for the binding wording. The retention
 * numbers come from the same functions the purge job uses, so the page cannot promise a window
 * the job does not keep.
 */

import { RETENTION_DAYS } from '@/lib/retention-windows';

export interface StoredThing {
    /** What the person would call it. */
    name: string;
    /** What it holds, in one sentence, without a table name. */
    what: string;
    /** Why it exists, so "we just do" is never an answer. */
    why: string;
    /** How long it stays, or null for "until you delete it". */
    retentionDays: number | null;
    /** Where the person can see or remove it. */
    where: string;
}

export function dataInventory(): StoredThing[] {
    return [
        {
            name: 'Your account',
            what: 'Email address, display name, language and time zone.',
            why: 'To sign you in and to label your export.',
            retentionDays: null,
            where: 'Settings → Profile, and Delete account',
        },
        {
            name: 'Your trackers and check-ins',
            what: 'The trackers you made, their questions, and every value, note and timestamp you logged.',
            why: 'This is the product: patterns and experiments are computed from it.',
            retentionDays: null,
            where: 'Data, and Download data export',
        },
        {
            name: 'Your experiments',
            what: 'Which two trackers a test compares, its dates, and its verdict.',
            why: 'To keep the result, and to say how sure it is.',
            retentionDays: null,
            where: 'Lab → the experiment itself',
        },
        {
            name: 'Whether you allowed AI explanations',
            what: 'One yes or no for the whole account, and when you decided.',
            why: 'To run an explanation only when you asked for one.',
            retentionDays: null,
            where: 'Settings → Privacy and consent',
        },
        {
            name: 'AI answers already generated',
            what: 'The text of explanations you asked for, kept so the same question is not paid for twice.',
            why: 'To answer faster and cheaper, and to delete them the moment you withdraw consent.',
            retentionDays: RETENTION_DAYS.insights(),
            where: 'Settings → Privacy and consent (withdrawing deletes them)',
        },
        {
            name: 'Connected-app keys and their activity',
            what: 'Which app is connected, which variables it may read, and what its key did (action, tracker, day — never a value).',
            why: 'So you can see what an app is doing and disconnect it in one tap.',
            retentionDays: null,
            where: 'Settings → Connected apps',
        },
        {
            name: 'Usage events',
            what: 'A row per tracker or check-in created, changed or deleted: the kind of change, its id and when.',
            why: 'To notice a broken release and to answer "is anyone using this" without reading a value.',
            retentionDays: RETENTION_DAYS.userEvents(),
            where: 'Deleted on a schedule; never includes what you logged',
        },
        {
            name: 'Daily AI spending',
            what: 'How many AI calls were made on a day and their rough cost, per account.',
            why: 'To stop a runaway loop costing money, and to notice a bad release early.',
            retentionDays: RETENTION_DAYS.userEvents(),
            where: 'Deleted on a schedule; no content of any answer',
        },
        {
            name: 'Keys, and what each key did',
            what: 'An assistant or connected app, its key, what it may read, and one row per action: what, which tracker, which day.',
            why: 'So you can see what has access and revoke it in one tap.',
            retentionDays: RETENTION_DAYS.userEvents(),
            where: 'Settings → Connected apps and Settings → API keys',
        },
        {
            name: 'Health import connections',
            what: 'Which device and health source you connected, the consent you gave, and when it last synced.',
            why: 'Health data may only be imported through a connection you made yourself.',
            retentionDays: null,
            where: 'Settings → Health import (disconnecting removes it)',
        },
        {
            name: 'Study consent, if you joined a study',
            what: 'A record that you agreed to a named study, when, and whether you withdrew.',
            why: 'Research consent has to be auditable, and withdrawal has to be provable.',
            retentionDays: null,
            where: 'The study page; contact us to withdraw',
        },
    ];
}

/** The line at the top of the card, so the limit of the claim is stated once. */
export const INVENTORY_PROMISE =
    'This is everything we hold about you. Export downloads all of it and Delete account removes it. AI explanations and health import run only while you have consented to them.';

/** Where the binding wording lives. */
export const POLICY_LINKS = [
    { href: '/privacy', label: 'Privacy policy' },
    { href: '/terms', label: 'Terms' },
    { href: '/cookies', label: 'Cookies' },
] as const;
