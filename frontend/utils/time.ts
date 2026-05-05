import { formatInTimeZone } from 'date-fns-tz';

/**
 * Formats a timestamp in a specific timezone.
 * @param timestampMs The timestamp in milliseconds
 * @param timezone The target timezone (e.g. 'Asia/Shanghai') or 'auto' for local browser timezone
 * @param formatStr The date-fns format string
 * @returns Formatted date string
 */
export const formatWithTimezone = (
    timestampMs: number | undefined, 
    timezone: string, 
    formatStr: string = 'yyyy-MM-dd HH:mm:ss'
): string => {
    if (!timestampMs) return '--';
    
    const tz = timezone === 'auto' ? Intl.DateTimeFormat().resolvedOptions().timeZone : timezone;
    
    try {
        return formatInTimeZone(new Date(timestampMs), tz, formatStr);
    } catch (e) {
        console.error(`Failed to format time in timezone ${tz}:`, e);
        // Fallback to local browser formatting if something goes wrong
        return new Date(timestampMs).toLocaleString('zh-CN', { hour12: false }).replace(/\//g, '-');
    }
};
