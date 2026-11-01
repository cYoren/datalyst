import { format } from "date-fns";

export function formatLocalDateKey(date: Date = new Date()): string {
    return format(date, "yyyy-MM-dd");
}
