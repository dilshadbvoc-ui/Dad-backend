
import { execSync } from 'child_process';
import fs from 'fs';
import { Interaction } from '../generated/client';

/**
 * Extract true duration of an audio file in seconds using ffprobe.
 */
export function getAudioDuration(filePath: string): number {
    try {
        if (!filePath || !fs.existsSync(filePath)) return 0;
        const output = execSync(
            `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`,
            { encoding: 'utf-8', timeout: 5000 }
        );
        const duration = parseFloat(output.trim());
        return isNaN(duration) ? 0 : Math.round(duration);
    } catch (err) {
        console.error('[CallUtils] Error getting audio duration via ffprobe:', err);
        return 0;
    }
}

/**
 * Utility to resolve the best duration for a call based on multiple sources.
 * Priority: Hardware (Carrier) > Recording (File) > Duration (Estimated)
 * 
 * @returns Duration in seconds
 */
export function resolveBestDurationSeconds(interaction: Partial<Interaction> | any): number {
    if (interaction.hardwareDuration && interaction.hardwareDuration > 0) {
        return interaction.hardwareDuration;
    }
    if (interaction.recordingDuration && interaction.recordingDuration > 0) {
        return interaction.recordingDuration;
    }
    if (interaction.duration && interaction.duration > 0) {
        return Math.round(interaction.duration * 60);
    }
    return 0;
}

/**
 * Normalizes a raw duration value.
 * Some Android apps/libraries report milliseconds instead of seconds.
 * If a duration is unrealistically high (e.g. > 10 hours for a phone call), 
 * we treat it as milliseconds.
 */
export function normalizeDuration(raw: any): number {
    let val = parseInt(raw, 10) || 0;
    // 36000 seconds = 10 hours. If it's more than that, it's likely ms.
    if (val > 36000) {
        return Math.round(val / 1000);
    }
    return val;
}

/**
 * Ensures both duration (minutes) and recordingDuration (seconds) are synchronized.
 * If one is provided but not the other, it calculates the missing one.
 */
export function synchronizeDurations(data: any) {
    // Normalize inputs first to prevent unit mismatches
    if (data.hardwareDuration !== undefined && data.hardwareDuration !== null) {
        data.hardwareDuration = normalizeDuration(data.hardwareDuration);
    }
    if (data.recordingDuration !== undefined && data.recordingDuration !== null) {
        data.recordingDuration = normalizeDuration(data.recordingDuration);
    }

    const hasHardware = data.hardwareDuration !== undefined && data.hardwareDuration !== null;
    const hasRecording = data.recordingDuration !== undefined && data.recordingDuration !== null;
    const hasDuration = data.duration !== undefined && data.duration !== null;

    if (hasHardware && !hasRecording) {
        data.recordingDuration = data.hardwareDuration;
    }

    if (hasHardware && !hasDuration) {
        data.duration = data.hardwareDuration / 60;
    } else if (hasRecording && !hasDuration) {
        data.duration = data.recordingDuration / 60;
    } else if (hasDuration && !hasRecording) {
        data.recordingDuration = Math.round(data.duration * 60);
    }

    // Round duration to 2 decimal places for DB consistency
    if (data.duration) {
        data.duration = Math.round(data.duration * 100) / 100;
    }
}

/**
 * Generates a standard human-readable description for a call duration.
 */
export function formatCallDurationDescription(seconds: number, options: { hasRecording?: boolean, isCarrierVerified?: boolean } = {}): string {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    let desc = `Duration: ${mins}m ${secs}s`;
    
    if (options.hasRecording) desc += ' (Recording attached)';
    if (options.isCarrierVerified) desc += ' [Carrier Verified]';
    
    return desc;
}
