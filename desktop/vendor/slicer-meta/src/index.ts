import { SlicerMeta } from './SlicerMeta';
import { SlicerFileMeta } from './SlicerFileMeta';
import { GCodeParser } from './parser/gcode/GCodeParser';
import { ThreeMfParser } from './parser/threemf/ThreeMfParser';
import * as path from 'path';
import type { FilamentInfo } from './FilamentInfo';
import type { SliceWarning } from './parser/threemf/ThreeMfParser';


export { SlicerType } from './SlicerType';
export { SlicerMeta } from './SlicerMeta';
export { SlicerFileMeta } from './SlicerFileMeta';
export type { FilamentInfo } from './FilamentInfo';
export type { SliceWarning } from './parser/threemf/ThreeMfParser';
export { translateWarning } from './parser/threemf/warning-translations';

export { GCodeParser } from './parser/gcode/GCodeParser';
export { FlashPrintParser } from './parser/gcode/FlashPrintParser';
export { OrcaFlashForgeParser } from './parser/gcode/OrcaFlashForgeParser';
export { OrcaFamilyParser } from './parser/gcode/orca-family/OrcaFamilyParser';
export { GXParser } from './parser/gcode/GXParser';
export { ThreeMfParser } from './parser/threemf/ThreeMfParser';

export interface ParseResult {
    slicer?: SlicerMeta | null;
    file?: SlicerFileMeta | null;
    threeMf?: {
        printerModelId: string;
        supportUsed: boolean;
        fileNames: string[];
        filaments: FilamentInfo[];
        plateImage: string | null;
        warnings: SliceWarning[];
        firstLayerTime: number | null;
        nozzleDiameters: number[];
    } | null;
}

/**
 * Convenience function to parse a G-code or 3MF file automatically.
 * @param filePath Path to the file.
 * @returns A promise resolving to the parsed metadata.
 * @throws Error on parsing failure or unknown format.
 */
export async function parseSlicerFile(filePath: string): Promise<ParseResult> {
    const ext = path.extname(filePath).toLowerCase();

    if (ext === '.3mf') {
        const parser = new ThreeMfParser().parse(filePath);
        return {
            slicer: parser.slicerInfo,
            file: parser.fileInfo,
            threeMf: {
                printerModelId: parser.printerModelId,
                supportUsed: parser.supportUsed,
                fileNames: parser.fileNames,
                filaments: parser.filaments,
                plateImage: parser.plateImage,
                warnings: parser.warnings,
                firstLayerTime: parser.firstLayerTime,
                nozzleDiameters: parser.nozzleDiameters,
            }
        };
    } else if (ext === '.gcode' || ext === '.g' || ext === '.gx') {
        const parser = new GCodeParser();
        await parser.parse(filePath);
        return {
            slicer: parser.slicerInfo,
            file: parser.fileInfo,
            threeMf: null
        };
    } else {
        console.warn(`Unknown file extension '${ext}'. Attempting G-code parse...`);
        try {
            const parser = new GCodeParser();
            await parser.parse(filePath);
            return {
                slicer: parser.slicerInfo,
                file: parser.fileInfo,
                threeMf: null
            };
        } catch (gcodeError: any) {
            const message = gcodeError instanceof Error ? gcodeError.message : String(gcodeError);
            throw new Error(`Unsupported file extension '${ext}' and G-code parsing failed: ${message}`);
        }
    }
}
