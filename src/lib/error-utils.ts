export interface AppErrorLike {
    message?: unknown;
    status?: unknown;
}

export function getErrorMessage(error: unknown, fallback: string): string {
    if (error instanceof Error && error.message) return error.message;
    if (typeof error === 'object' && error !== null && 'message' in error) {
        const message = (error as AppErrorLike).message;
        if (typeof message === 'string' && message) return message;
    }
    return fallback;
}

export function getErrorStatus(error: unknown): number | undefined {
    if (typeof error === 'object' && error !== null && 'status' in error) {
        const status = (error as AppErrorLike).status;
        return typeof status === 'number' ? status : undefined;
    }
    return undefined;
}

/** An expected, user-safe failure (not found, invalid input) with an HTTP status. */
export class ServiceError extends Error {
    constructor(message: string, public status: number) {
        super(message);
    }
}
