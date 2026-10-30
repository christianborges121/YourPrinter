export enum SlicerType {
    FlashPrint = 'FlashPrint',     // Legacy FlashPrint/ffslicer
    OrcaFF = 'OrcaFF',             // OrcaSlicer & Orca-FlashForge
    FlashStudio = 'FlashStudio',   // FlashForge FlashStudio
    SnapmakerOrca = 'SnapmakerOrca', // Snapmaker's OrcaSlicer fork
    LegacyGX = 'LegacyGX',         // Legacy .gx format
    Unknown = 'Unknown'            // Others
}