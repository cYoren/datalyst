import 'server-only';

/**
 * What an AI log line is allowed to contain.
 *
 * Run metadata is identifiers and numbers only (see `AiRunMetadata`). Anything that carries
 * user text — a prompt, a journal line, a model completion — must never be logged, and this
 * module is the one place that decides what "carries user text" means, so the rule is
 * testable instead of a comment.
 */

/**
 * Longest a safe metadata string can be. Ids and model names are far shorter.
 *
 * Length alone is not enough: "chest pain again" is four words and still a journal line. The
 * rule that actually separates the two is whitespace — an identifier, a model id, an error
 * code and a correlation id never contain a space, and prose always does.
 */
export const MAX_SAFE_METADATA_CHARS = 64;

const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/;
const URL = /\bhttps?:\/\/\S+/i;
const BEARER = /\b(?:bearer|token|key|secret|password)\b\s*[:=]?\s*\S{8,}/i;
/** Vendor-shaped secrets: our own device keys, OpenAI, GitHub, Anthropic, and JWTs. */
const SECRET = /\b(?:dl_[A-Za-z0-9_-]{16,}|sk-[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9]{20,}|eyJ[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{8,})/;

/** The same patterns, global, for rewriting a whole line rather than testing one. */
const EMAIL_G = new RegExp(EMAIL.source, 'g');
const URL_G = new RegExp(URL.source, 'gi');
const BEARER_G = new RegExp(BEARER.source, 'gi');
const SECRET_G = new RegExp(SECRET.source, 'g');
const WHITESPACE = /\s+/g;

/**
 * True when a string could carry a person's data rather than an identifier: it has a space
 * in it (prose), it is longer than an id ever is, or it matches an address, URL or credential.
 */
export function looksSensitive(value: string): boolean {
    if (value.length > MAX_SAFE_METADATA_CHARS) return true;
    // Any whitespace at all: identifiers are single tokens.
    if (/\s/.test(value.trim())) return true;
    return EMAIL.test(value) || URL.test(value) || BEARER.test(value) || SECRET.test(value);
}

/**
 * True when every field of a metadata object is a scalar that could not carry user text.
 * The runner's own metadata must pass this; the tests assert it on real success and failure
 * runs, which is what makes "no sensitive payload reaches logs" a check and not a promise.
 */
export function isSafeRunMetadata(metadata: Record<string, unknown>): boolean {
    return Object.values(metadata).every((value) => {
        if (value === null || value === undefined) return true;
        if (typeof value === 'number' || typeof value === 'boolean') return true;
        if (typeof value === 'string') return !looksSensitive(value);
        // Arrays are where a summary of what was redacted would live, so they are inspected
        // rather than waved through: an array of strings is a list of strings.
        if (Array.isArray(value)) {
            return value.every((item) => {
                if (item === null || item === undefined) return true;
                if (typeof item === 'string') return !looksSensitive(item);
                if (typeof item === 'number' || typeof item === 'boolean') return true;
                return typeof item === 'object' && isSafeRunMetadata(item as Record<string, unknown>);
            });
        }
        if (typeof value === 'object') {
            return Object.values(value as Record<string, unknown>).every(
                (inner) => typeof inner === 'number' || typeof inner === 'boolean' || inner === null || inner === undefined,
            );
        }
        return false;
    });
}

/**
 * Last line of defence for a log line that has to include free text: strip the shapes that
 * identify a person or a credential, collapse it to one line, and cut it short. Not a
 * substitute for not logging the text at all.
 */
export function redactForLog(value: unknown, maxChars = 120): string {
    const text = typeof value === 'string' ? value : String(value ?? '');
    return text
        .replace(EMAIL_G, '[email]')
        .replace(URL_G, '[url]')
        .replace(BEARER_G, '[credential]')
        .replace(SECRET_G, '[secret]')
        .replace(WHITESPACE, ' ')
        .trim()
        .slice(0, maxChars);
}
