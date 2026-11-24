// Pure module: no Shell/GI imports, unit-testable with `gjs -m`.

export const UpState = Object.freeze({
    UNKNOWN: 0,
    CHARGING: 1,
    DISCHARGING: 2,
    EMPTY: 3,
    FULLY_CHARGED: 4,
    PENDING_CHARGE: 5,
    PENDING_DISCHARGE: 6,
});

// Plugged into AC: charging, full, or held by a charge threshold.
const PLUGGED = new Set([UpState.CHARGING, UpState.FULLY_CHARGED, UpState.PENDING_CHARGE]);

/**
 * Color priority: CHARGING > LOW > SAVER > NORMAL.
 * The bolt glyph is an independent channel and is shown whenever plugged.
 *
 * @param {{present: boolean, state: number, percent: number} | null} battery
 * @param {string | null} profile  power-profiles ActiveProfile
 * @param {{lowThreshold?: number}} [cfg]
 */
export function resolve(battery, profile, {lowThreshold = 15} = {}) {
    if (!battery?.present)
        return {visible: false};

    const level = Math.min(100, Math.max(0, Math.round(battery.percent ?? 0)));
    const charging = PLUGGED.has(battery.state);

    let tone;
    if (charging)
        tone = 'charging';
    else if (level <= lowThreshold)
        tone = 'low';
    else if (profile === 'power-saver')
        tone = 'saver';
    else
        tone = 'normal';

    return {visible: true, tone, level, bolt: charging};
}

export function stateKey(s) {
    return s.visible ? `${s.tone}|${s.level}|${s.bolt ? 1 : 0}` : 'hidden';
}
