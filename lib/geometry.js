// Pure module: proportions, device-pixel snapping, vector paths.
// All values are in design (logical) pixels; `ds` = device pixels per design pixel.

export const HEIGHT_MIN = 10;
export const HEIGHT_MAX = 22;
export const HEIGHT_DEFAULT = 14;

// Phone status-bar battery proportions (iOS-like), relative to body height.
const ASPECT = 2.08;     // body width / height
const RADIUS = 0.34;     // corner radius / height
const NUB_H = 0.36;      // nub height / height
const NUB_W = 0.12;      // nub width / height
const NUB_GAP = 0.08;    // gap body→nub / height

export function snap(v, ds) {
    return Math.round(v * ds) / ds;
}

const dev = (v, ds, min = 1) => Math.max(min, Math.round(v * ds));

/** Layout for a body of height `height`, snapped to the device-pixel grid. */
export function layout(height = HEIGHT_DEFAULT, ds = 1) {
    const h = Math.min(HEIGHT_MAX, Math.max(HEIGHT_MIN, Number(height) || HEIGHT_DEFAULT));
    const devH = dev(h, ds);
    const devW = dev(h * ASPECT, ds);

    // Nub height parity must match body height parity to sit exactly centered.
    let devNubH = dev(h * NUB_H, ds, 2);
    if ((devH - devNubH) % 2 !== 0)
        devNubH += 1;

    const body = {x: 0, y: 0, w: devW / ds, h: devH / ds};
    body.r = RADIUS * body.h;

    const nub = {
        x: body.w + dev(h * NUB_GAP, ds) / ds,
        y: (devH - devNubH) / 2 / ds,
        w: Math.max(dev(1.5, ds), dev(h * NUB_W, ds)) / ds,
        h: devNubH / ds,
    };

    return {body, nub, width: nub.x + nub.w, height: body.h, ds};
}

/** Fill width for a (possibly fractional, while animating) level. */
export function fillWidth(body, level, ds) {
    if (level <= 0)
        return 0;
    return Math.max(1 / ds, snap(body.w * Math.min(100, level) / 100, ds));
}

/**
 * Continuous-corner ("squircle") rounded rectangle.
 * Each corner is one cubic whose control points sit near the corner, giving
 * zero curvature where it meets the straight edge (curvature continuity),
 * tuned so the corner depth matches a circular corner of radius r.
 *
 * @param {{moveTo, lineTo, curveTo, closePath}} sink  cairo context or test recorder
 */
export function squirclePath(sink, {x, y, w, h, r}) {
    r = Math.min(r, w / 2, h / 2);
    if (r <= 0) {
        sink.moveTo(x, y);
        sink.lineTo(x + w, y);
        sink.lineTo(x + w, y + h);
        sink.lineTo(x, y + h);
        sink.closePath();
        return;
    }
    const p = Math.min(r * 1.5, w / 2, h / 2);
    // Bezier midpoint depth p(1+3a)/8 == circle depth r(1 - 1/sqrt2)
    const a = Math.min(0.4477, Math.max(0, (8 * (1 - Math.SQRT1_2) * r / p - 1) / 3));
    const c = p * a;

    sink.moveTo(x + p, y);
    sink.lineTo(x + w - p, y);
    sink.curveTo(x + w - c, y, x + w, y + c, x + w, y + p);
    sink.lineTo(x + w, y + h - p);
    sink.curveTo(x + w, y + h - c, x + w - c, y + h, x + w - p, y + h);
    sink.lineTo(x + p, y + h);
    sink.curveTo(x + c, y + h, x, y + h - c, x, y + h - p);
    sink.lineTo(x, y + p);
    sink.curveTo(x, y + c, x + c, y, x + p, y);
    sink.closePath();
}

/** Nub: flat on the left, a half-pill on the right. */
export function nubPath(sink, {x, y, w, h}) {
    const r = Math.min(w, h / 2);
    const k = 0.5523 * r;
    sink.moveTo(x, y);
    sink.lineTo(x + w - r, y);
    sink.curveTo(x + w - r + k, y, x + w, y + r - k, x + w, y + r);
    sink.lineTo(x + w, y + h - r);
    sink.curveTo(x + w, y + h - r + k, x + w - r + k, y + h, x + w - r, y + h);
    sink.lineTo(x, y + h);
    sink.closePath();
}

// Bolt polygon in a unit box; aspect ratio w:h = BOLT_ASPECT:1.
// Sharp, slightly italic silhouette like the iOS charging glyph.
export const BOLT_ASPECT = 0.62;
const BOLT = [
    [0.74, 0.00], [0.00, 0.60], [0.42, 0.60], [0.26, 1.00],
    [1.00, 0.40], [0.58, 0.40],
];

export function boltPath(sink, x, y, h) {
    const w = h * BOLT_ASPECT;
    BOLT.forEach(([u, v], i) => {
        const px = x + u * w, py = y + v * h;
        if (i === 0)
            sink.moveTo(px, py);
        else
            sink.lineTo(px, py);
    });
    sink.closePath();
}

/** '#RRGGBB' → [r, g, b] in 0..1; null when invalid. */
export function parseHex(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(String(hex).trim());
    if (!m)
        return null;
    const n = parseInt(m[1], 16);
    return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255];
}

export function mix(a, b, t) {
    return a.map((v, i) => v + (b[i] - v) * t);
}
