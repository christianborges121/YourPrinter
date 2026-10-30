import * as fs from 'fs';
import * as readline from 'readline';
import { SlicerMeta } from '../../SlicerMeta';
import { SlicerFileMeta } from '../../SlicerFileMeta';
import { SlicerType } from '../../SlicerType';
import { FlashPrintParser } from './FlashPrintParser';
import { OrcaFlashForgeParser } from './OrcaFlashForgeParser';
import { GXParser } from './GXParser';

/**
 * AIO GCode Parser
 * Supports Orca-FlashForge, FlashPrint, and Legacy GX g-code files.
 */
export class GCodeParser {
    public slicerInfo: SlicerMeta | null = null;
    public fileInfo: SlicerFileMeta | null = null;

    constructor() {
        // Properties initialized to null
    }

    /**
     * Parses a G-code file from the given file path.
     * Automatically detects the slicer type and delegates parsing.
     * @param filePath Path to the G-code or 3MF file.
     * @returns The parser instance for chaining or accessing results.
     * @throws Error if the file is unreadable, slicer type is unknown, or parsing fails.
     */
    public async parse(filePath: string): Promise<this> {

        let slicerType: SlicerType;
        try {
            slicerType = await this.getSlicerTypeFromFile(filePath);
        } catch (error: any) {
            throw new Error(`Failed to determine slicer type for ${filePath}: ${error.message}`);
        }

        if (slicerType === SlicerType.Unknown) {
            throw new Error("Cannot process file: sliced by unknown software or format unrecognized.");
        }

        try {
            let result;
            switch (slicerType) {
                case SlicerType.FlashPrint:
                    result = FlashPrintParser.parse(filePath);
                    this.slicerInfo = result.slicerMeta;
                    this.fileInfo = result.fileMeta;
                    break;
                case SlicerType.OrcaFF:
                    // For simplicity, we re-read for now. Optimization possible later.
                    result = OrcaFlashForgeParser.parse(filePath);
                    this.slicerInfo = result.slicerMeta;
                    this.fileInfo = result.fileMeta;
                    break;
                case SlicerType.LegacyGX:
                    result = GXParser.parse(filePath);
                    this.slicerInfo = result.slicerMeta;
                    this.fileInfo = result.fileMeta;
                    break;
            }
        } catch (parseError: any) {
            console.error(`Error parsing ${slicerType} file ${filePath}:`, parseError);
            throw new Error(`Failed to parse ${slicerType} file: ${parseError.message}`);
        }

        return this;
    }

    /**
     * Parses G-code content provided as a string or Buffer.
     * Automatically detects the slicer type and delegates parsing.
     * @param content The G-code content.
     * @returns The parser instance for chaining or accessing results.
     * @throws Error if the slicer type is unknown or parsing fails.
     */
    public parseFromContent(content: string | Buffer): this {
        const slicerType = this.getSlicerTypeFromContent(content);

        if (slicerType === SlicerType.Unknown) {
            throw new Error("Cannot process content: sliced by unknown software or format unrecognized.");
        }

        try {
            let result;
            switch (slicerType) {
                case SlicerType.FlashPrint:
                    result = FlashPrintParser.parseFromContent(content);
                    this.slicerInfo = result.slicerMeta;
                    this.fileInfo = result.fileMeta;
                    break;
                case SlicerType.OrcaFF:
                    result = OrcaFlashForgeParser.parseFromContent(content);
                    this.slicerInfo = result.slicerMeta;
                    this.fileInfo = result.fileMeta;
                    break;
                case SlicerType.LegacyGX:
                    result = GXParser.parseFromContent(content);
                    this.slicerInfo = result.slicerMeta;
                    this.fileInfo = result.fileMeta;
                    break;
            }
        } catch (parseError: any) {
            console.error(`Error parsing ${slicerType} content:`, parseError);
            throw new Error(`Failed to parse ${slicerType} content: ${parseError.message}`);
        }

        return this;
    }

    /**
     * Checks if the file extension is typically associated with G-code or 3MF.
     * Note: This is a basic check and not reliable for format identification.
     * @param filePath The path to the file.
     * @returns True if the extension matches common formats, false otherwise.
     */
    private isOkExt(filePath: string): boolean {
        const lowerPath = filePath.toLowerCase();
        return lowerPath.endsWith(".g") || lowerPath.endsWith(".gcode") || lowerPath.endsWith(".gx") // G-code formats
            || lowerPath.endsWith(".3mf"); // 3MF format
    }

    /**
     * Determines the slicer type by reading the first line of a file.
     * @param filePath Path to the G-code file.
     * @returns The detected SlicerType.
     * @throws Error if the file cannot be read.
     */
    private async getSlicerTypeFromFile(filePath: string): Promise<SlicerType> {
        return new Promise((resolve, reject) => {
            let stream: fs.ReadStream | null = null;
            let rl: readline.Interface | null = null;
            let header: string | null = null;
            let firstLineRead = false;
            let settled = false; // Prevent settling the promise twice

            const cleanupAndSettle = (error?: Error, result?: SlicerType) => {
                if (settled) return; // Already resolved or rejected
                settled = true;

                // console.log(`Cleaning up for ${filePath}. Error: ${error}, Result: ${result}`);

                if (rl) {
                    rl.close(); // This signals readline to stop reading
                    rl.removeAllListeners(); // Prevent memory leaks
                }
                if (stream && !stream.destroyed) {
                    stream.close(); // Close the underlying file stream
                    stream.removeAllListeners();
                }

                if (error) {
                    reject(error);
                } else {
                    resolve(result ?? this.detectTypeFromHeader(header ?? ""));
                }
            };

            try {
                stream = fs.createReadStream(filePath, { encoding: 'utf8' });
                rl = readline.createInterface({
                    input: stream,
                    crlfDelay: Infinity,
                });

                rl.on('line', (line) => {
                    if (!firstLineRead) {
                        // console.log(`First line read for ${filePath}: ${line}`); // Debug log
                        header = line.trim();
                        firstLineRead = true;
                        cleanupAndSettle(undefined, this.detectTypeFromHeader(header));
                    }
                });

                rl.on('close', () => {
                    cleanupAndSettle();
                });

                rl.on('error', (err) => {
                    console.error(`Readline error for ${filePath}:`, err);
                    cleanupAndSettle(err); // Reject with the error
                });

                stream.on('error', (err) => { // Catch stream errors (e.g., file not found, permissions)
                    console.error(`Stream error for ${filePath}:`, err);
                    cleanupAndSettle(err); // Reject with the error
                });

                // stream.on('close', () => {
                //     console.log(`Stream closed event for ${filePath}`);
                // });

            } catch (syncErr: any) { // Catch synchronous errors (e.g., invalid path)
                console.error(`Synchronous error setting up stream for ${filePath}:`, syncErr);
                reject(syncErr);
                settled = true;
            }
        });
    }

    /**
     * Determines the slicer type from the first line of G-code content.
     * @param content G-code content as a string or Buffer.
     * @returns The detected SlicerType.
     */
    private getSlicerTypeFromContent(content: string | Buffer): SlicerType {
        let header: string | null = null;
        const contentString = Buffer.isBuffer(content) ? content.toString('utf-8', 0, 512) : content; // Read start of buffer/string

        const newlineIndex = contentString.indexOf('\n');
        if (newlineIndex !== -1) {
            header = contentString.substring(0, newlineIndex).trim();
        } else {
            header = contentString.trim(); // Use the whole string if no newline
        }


        if (!header) {
            console.warn("G-code content seems empty.");
            return SlicerType.Unknown;
        }

        return this.detectTypeFromHeader(header);
    }

    /**
     * Detects SlicerType based on a header line.
     * @param header The header line string.
     * @returns The detected SlicerType.
     */
    private detectTypeFromHeader(header: string): SlicerType {
        // FlashPrint check
        if (header.startsWith(';generated by ffslicer')) {
            return SlicerType.FlashPrint;
        }
        // Orca check (covers Orca, Orca-FF, Bambu?)
        // Check for specific block start or thumbnail markers typical in OrcaSlicer forks
        if (header.startsWith('; HEADER_BLOCK_START') || header.startsWith('; THUMBNAIL_BLOCK_START') || header.startsWith('; thumbnail begin')) {
            // Further refinement could check for "; generated by Orca-Flashforge"
            // but the block structure is a strong indicator for Orca-like slicers.
            return SlicerType.OrcaFF;
        }
        // Legacy GX format check
        if (header.startsWith('xgcode 1.0')) {
            return SlicerType.LegacyGX;
        }
        // Add checks for other slicers here if needed (e.g., PrusaSlicer, Cura)
        // ; generated by PrusaSlicer
        // ;FLAVOR:Marlin
        // ;TIME:
        // ;Filament used:
        // ;Layer height:
        // ;Generated with Cura_SteamEngine

        console.warn(`Could not determine slicer type from header: "${header}"`);
        return SlicerType.Unknown;
    }
}