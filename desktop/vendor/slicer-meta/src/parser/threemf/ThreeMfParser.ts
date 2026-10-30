import * as fs from 'fs';
import AdmZip from 'adm-zip';
import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { SlicerMeta } from '../../SlicerMeta';
import { SlicerFileMeta } from '../../SlicerFileMeta';
import { FilamentInfo } from '../../FilamentInfo';
import { GCodeParser } from '../gcode/GCodeParser';
import { translateWarning } from './warning-translations';

interface SliceInfoConfig {
    config?: {
        plate?: {
            metadata?: MetadataEntry[] | MetadataEntry;
            object?: ObjectEntry[] | ObjectEntry;
            filament?: FilamentEntry[] | FilamentEntry;
            warning?: WarningEntry[] | WarningEntry;
            layer_filament_lists?: any;
        };
    };
}

interface MetadataEntry {
    '@_key': string;
    '@_value': string;
}

interface ObjectEntry {
    '@_name': string;
}

interface FilamentEntry {
    '@_id': string;
    '@_type': string;
    '@_color': string;
    '@_used_m': string;
    '@_used_g': string;
}

interface WarningEntry {
    '@_msg': string;
    '@_level': number;
    '@_error_code': string;
}

/**
 * Parser for 3MF files, tested with Orca-FlashForge and FlashStudio output.
 * Extracts metadata from slice_info.config, plate image, and embedded G-code.
 */
export class ThreeMfParser {
    public printerModelId: string = "Unknown";
    public supportUsed: boolean = false;
    public fileNames: string[] = [];
    public filaments: FilamentInfo[] = [];
    public plateImage: string | null = null; // Store as Base64 data URL
    public warnings: SliceWarning[] = [];
    public firstLayerTime: number | null = null; // Seconds
    public nozzleDiameters: number[] = []; // Per-extruder nozzle diameters (mm)

    // Metadata extracted from the embedded G-code file
    public slicerInfo: SlicerMeta | null = null;
    public fileInfo: SlicerFileMeta | null = null;

    // XML Parser configuration
    private xmlParser = new XMLParser({
        ignoreAttributes: false,
        attributeNamePrefix: "@_",
        allowBooleanAttributes: true,
        parseAttributeValue: true,
        trimValues: true,
    });

    constructor() {
        // Defaults are set via initializers
    }

    /**
     * Parses a 3MF file from the given path.
     * @param filePath Path to the 3MF file.
     * @returns The parser instance.
     * @throws Error if the file cannot be read, is not a valid ZIP, or required entries are missing/invalid.
     */
    public parse(filePath: string): this {
        let zip: AdmZip;
        try {
            if (!fs.existsSync(filePath)) {
                throw new Error(`File not found: ${filePath}`);
            }
            zip = new AdmZip(filePath);
        } catch (error: any) {
            console.error(`Error opening or reading 3MF file ${filePath}:`, error);
            throw new Error(`Failed to open or read 3MF file '${filePath}': ${error.message}`);
        }

        const zipEntries = zip.getEntries();

        // 1. Parse slice_info.config
        const configEntry = zipEntries.find((entry: { entryName: string; }) => entry.entryName === 'Metadata/slice_info.config');
        if (configEntry) {
            try {
                const configContent = configEntry.getData().toString('utf8');
                if (XMLValidator.validate(configContent) === true) {
                    const parsedXml: SliceInfoConfig = this.xmlParser.parse(configContent);
                    this.parseConfigXml(parsedXml);
                } else {
                    console.warn("slice_info.config XML validation failed.");
                    throw new Error("Invalid XML structure in slice_info.config.");
                }
            } catch (error: any) {
                console.error("Error parsing slice_info.config:", error);
                throw new Error(`Failed to parse slice_info.config: ${error.message}`);
            }
        } else {
            console.warn("Metadata/slice_info.config not found in 3MF archive.");
        }

        // 2. Extract Plate Image
        const imageEntry = zipEntries.find((entry: { entryName: string; }) => entry.entryName.match(/^Metadata\/plate_\d+\.png$/));
        if (imageEntry) {
            try {
                const imageBuffer = imageEntry.getData();
                this.plateImage = `data:image/png;base64,${imageBuffer.toString('base64')}`;
            } catch (error: any) {
                console.error("Error extracting plate image:", error);
            }
        } else {
            console.warn("Plate image (e.g., Metadata/plate_1.png) not found in 3MF archive.");
        }

        // 3. Parse embedded g-code
        const gcodeEntry = zipEntries.find((entry: { entryName: string; }) => entry.entryName.match(/^Metadata\/plate_\d+\.gcode$/));
        if (gcodeEntry) {
            try {
                const gcodeContent = gcodeEntry.getData();
                const gcodeParser = new GCodeParser().parseFromContent(gcodeContent);
                this.slicerInfo = gcodeParser.slicerInfo;
                this.fileInfo = gcodeParser.fileInfo;

                if (this.printerModelId === "Unknown" && this.fileInfo?.printerModel !== "Unknown") {
                    this.printerModelId = this.fileInfo?.printerModel ?? "Unknown";
                }

                // Create default filament info if not provided by slice_info
                if (this.filaments.length === 0 && this.fileInfo) {
                    if (this.fileInfo.filaments && this.fileInfo.filaments.length > 0) {
                        this.filaments = this.fileInfo.filaments;
                    } else if (this.fileInfo.filamentType !== "Unknown") {
                        this.filaments.push({
                            id: "0",
                            type: this.fileInfo.filamentType,
                            color: "Unknown",
                            usedM: this.fileInfo.filamentUsedMM?.toString(),
                            usedG: this.fileInfo.filamentUsedG?.toString(),
                        });
                    }
                }
            } catch (error: any) {
                throw new Error(`Failed to parse embedded G-code: ${error.message}`);
            }
        } else {
            throw new Error("Embedded G-code is missing.");
        }

        return this;
    }

    /**
     * Parses the data extracted from the slice_info.config XML.
     * @param xmlData Parsed XML object from fast-xml-parser.
     */
    private parseConfigXml(xmlData: SliceInfoConfig): void {
        const plate = xmlData?.config?.plate;
        if (!plate) {
            console.warn("<plate> element not found or invalid structure in slice_info.config.");
            return;
        }

        const ensureArray = <T>(item: T | T[] | undefined): T[] => {
            if (!item) return [];
            return Array.isArray(item) ? item : [item];
        };

        // Parse Metadata
        const metadataItems = ensureArray(plate.metadata);
        const printerModelMeta = metadataItems.find(m => m['@_key'] === 'printer_model_id');
        if (printerModelMeta) {
            this.printerModelId = printerModelMeta['@_value'] ?? "Unknown";
        }

        const supportUsedMeta = metadataItems.find(m => m['@_key'] === 'support_used');
        if (supportUsedMeta) {
            this.supportUsed = supportUsedMeta['@_value'] === 'true' || supportUsedMeta['@_value'] === '1';
        }

        // Parse first layer time (optional — added in FlashStudio, may appear in future Orca releases)
        const firstLayerTimeMeta = metadataItems.find(m => m['@_key'] === 'first_layer_time');
        if (firstLayerTimeMeta) {
            const val = parseFloat(firstLayerTimeMeta['@_value']);
            if (!isNaN(val)) {
                this.firstLayerTime = val;
            }
        }

        // Parse nozzle diameters (comma-separated per-extruder, e.g. "0.4,0.4,0.4,0.4")
        const nozzleDiametersMeta = metadataItems.find(m => m['@_key'] === 'nozzle_diameters');
        if (nozzleDiametersMeta) {
            this.nozzleDiameters = String(nozzleDiametersMeta['@_value'] ?? '')
                .split(/[, ]+/)
                .map(v => parseFloat(v.trim()))
                .filter(v => !isNaN(v));
        }

        // Parse Object Names
        const objectItems = ensureArray(plate.object);
        this.fileNames = objectItems.map(obj => obj['@_name']).filter(name => !!name);

        // Parse Filament Info
        const filamentItems = ensureArray(plate.filament);
        this.filaments = filamentItems.map((fil, index) => {
            const rawId = fil['@_id'];

            const filamentInfo: FilamentInfo = {
                id: rawId?.toString(),
                type: fil['@_type'],
                color: fil['@_color'],
                usedM: fil['@_used_m']?.toString(),
                usedG: fil['@_used_g']?.toString(),
            };

            return filamentInfo;
        });

        // Parse Warnings (optional — added in FlashStudio)
        const warningItems = ensureArray(plate.warning);
        this.warnings = warningItems.map(w => {
            const msg = w['@_msg'] ?? '';
            return {
                msg,
                message: translateWarning(msg),
                level: w['@_level'] ?? 0,
                errorCode: w['@_error_code'] ?? '',
            };
        });
    }
}

/** A slicer warning extracted from 3MF slice_info.config */
export interface SliceWarning {
    /** Raw warning key as emitted by the slicer, e.g. `bed_temperature_too_high_than_filament`. */
    msg: string;
    /** Human-readable translation of `msg`, suitable for display. */
    message: string;
    level: number;
    errorCode: string;
}
