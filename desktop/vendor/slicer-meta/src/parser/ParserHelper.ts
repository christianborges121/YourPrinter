import { format, parse } from 'date-fns';

export class ParserHelper {

    /**
     * Parses a 24-hour time string (HH:mm:ss) and formats it to h:mm tt (e.g., 3:13 PM).
     * Returns "Error" on failure.
     * @param sliceTime Time string in HH:mm:ss format.
     */
    public static parseSliceTime(sliceTime: string): string {
        if (!sliceTime || typeof sliceTime !== 'string') {
            console.warn(`ParserHelper received invalid slice time input: ${sliceTime}`);
            return "Error";
        }
        try {
            const date = parse(sliceTime, 'HH:mm:ss', new Date()); // 24-hour format parsing
            return format(date, 'h:mm aa'); // 12-hour AM/PM format output
        } catch (e) {
            console.error(`ParserHelper cannot parse invalid slice time - "${sliceTime}"\n`, e);
            return "Error";
        }
    }

    /**
     * Safely parses a string to a float, returning 0.0 on failure.
     * @param value The string value to parse.
     * @returns The parsed float or 0.0.
     */
    public static parseFloatOrDefault(value: string | undefined | null): number {
        if (value === null || value === undefined) return 0.0;
        const num = parseFloat(value);
        return isNaN(num) ? 0.0 : num;
    }
}