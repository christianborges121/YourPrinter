/**
 * Human-readable translations for OrcaSlicer-family warning keys.
 *
 * Slicers in the OrcaSlicer family (OrcaSlicer, Orca-FlashForge, FlashStudio)
 * embed slice warnings in `Metadata/slice_info.config` as raw i18n keys
 * (e.g. `bed_temperature_too_high_than_filament`) rather than display text.
 * This map turns those keys into readable sentences. Unknown keys fall back to
 * a generic prettifier so new warnings still render acceptably.
 *
 * The keys are defined in OrcaSlicer's `src/libslic3r/GCode/GCodeProcessor.hpp`
 * and the wording mirrors `Plater::get_slice_warning_string()` in
 * `src/slic3r/GUI/Plater.cpp`, so messages match what the slicer itself shows.
 */
const KNOWN_WARNINGS: Record<string, string> = {
    // BED_TEMP_TOO_HIGH_THAN_FILAMENT
    bed_temperature_too_high_than_filament:
        'The current hot bed temperature is relatively high. The nozzle may be clogged when printing this filament in a closed enclosure. Please open the front door and/or remove the upper glass.',
    // NOZZLE_HRC_CHECKER
    the_actual_nozzle_hrc_smaller_than_the_required_nozzle_hrc:
        'The nozzle hardness required by the filament is higher than the default nozzle hardness of the printer. Please replace the hardened nozzle or filament, otherwise, the nozzle will be attrited or damaged.',
    // NOT_SUPPORT_TRADITIONAL_TIMELAPSE
    not_support_traditional_timelapse:
        'Enabling traditional timelapse photography may cause surface imperfections. It is recommended to change to smooth mode.',
    // NOT_GENERATE_TIMELAPSE (OrcaSlicer suppresses this one in its own UI)
    not_generate_timelapse:
        'Timelapse will not be generated for this print.',
    // SMOOTH_TIMELAPSE_WITHOUT_PRIME_TOWER
    smooth_timelapse_without_prime_tower:
        'Smooth mode for timelapse is enabled, but the prime tower is off, which may cause print defects. Please enable the prime tower, re-slice and print again.',
    // LONG_RETRACTION_WHEN_CUT (OrcaSlicer has no curated text; this is ours)
    activate_long_retraction_when_cut:
        'Long retraction when cut is enabled for this print.',
};

/**
 * Converts an unknown snake_case warning key into a readable sentence as a
 * best-effort fallback, e.g. `some_new_warning` -> "Some new warning".
 */
function prettifyKey(key: string): string {
    const words = key.replace(/_/g, ' ').trim();
    if (!words) return '';
    return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * Translates a raw slicer warning key into human-readable text.
 * Returns a curated message for known keys, a prettified fallback for unknown
 * snake_case keys, and an empty string if the input is empty.
 */
export function translateWarning(msg: string): string {
    if (!msg) return '';
    return KNOWN_WARNINGS[msg] ?? prettifyKey(msg);
}
