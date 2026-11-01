export function logToFile(message: string, data?: unknown) {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] ${message} ${data ? JSON.stringify(data, null, 2) : ''}`;

    // Always log to console for now, as file system is not available in Edge Runtime
    // and we want to avoid the "Module not found: Can't resolve 'fs'" error.
    if (data) {
        console.log(logEntry, data);
    } else {
        console.log(logEntry);
    }
}

