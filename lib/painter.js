// Cairo painter shared by the panel widget, the prefs preview and
// tools/render-preview.js. Needs only Cairo + Pango (no Shell, no Gtk).
import Cairo from 'cairo';
import Pango from 'gi://Pango';
import PangoCairo from 'gi://PangoCairo';

import {BOLT_ASPECT, boltPath, fillWidth, layout, nubPath, snap, squirclePath} from './geometry.js';

const TRACK_ALPHA = 0.35;

// 'default': SF Pro Text Bold (700), the iOS status-bar face.
// 'system': the panel's own font; heavier so knocked-out digits stay legible.
export const DEFAULT_FAMILY = 'SF Pro Text';
const SYSTEM_WEIGHT = 800;

let _families = null;
/** True if the family is installed (checked once per process via fontconfig). */
export function hasFamily(name) {
    _families ??= new Set(PangoCairo.FontMap.get_default().list_families()
        .map(f => f.get_name().toLowerCase()));
    return _families.has(name.toLowerCase());
}

/**
 * Resolves the font setting to {family, weight}. Falls back to the system
 * font when SF Pro Text is not installed, instead of letting fontconfig pick
 * an arbitrary substitute.
 */
export function resolveFont(setting, systemFamily) {
    if (setting !== 'system' && hasFamily(DEFAULT_FAMILY))
        return {family: DEFAULT_FAMILY, weight: Pango.Weight.BOLD};
    return {family: systemFamily || 'Adwaita Sans', weight: SYSTEM_WEIGHT};
}
const NUB_ALPHA = 0.4;

/**
 * Paints the battery into `cr`, whose user space is design pixels.
 * The target must start transparent: the percentage and bolt are knocked out
 * (Operator.CLEAR), so they show whatever is behind the panel.
 *
 * @param {object} o
 * @param {number} o.height  body height in design px
 * @param {number} o.ds  device pixels per design pixel (for snapping)
 * @param {number[]} o.fg  [r, g, b, a] theme foreground, 0..1
 * @param {number[]} o.fillColor  [r, g, b, a]
 * @param {number} o.fillLevel  0..100, may be fractional while animating
 * @param {number} o.level  integer percentage shown as text
 * @param {boolean} o.bolt
 * @param {{family: string, weight: number}} [o.font]
 */
export function paintBattery(cr, o) {
    const {body, nub} = layout(o.height, o.ds);
    const [r, g, b, a] = o.fg;

    cr.save();
    squirclePath(cr, body);
    cr.clip();
    cr.setSourceRGBA(r, g, b, a * TRACK_ALPHA);
    cr.paint();
    cr.rectangle(body.x, body.y, fillWidth(body, o.fillLevel, o.ds), body.h);
    cr.setSourceRGBA(...o.fillColor);
    cr.fill();
    cr.restore();

    nubPath(cr, nub);
    cr.setSourceRGBA(r, g, b, a * NUB_ALPHA);
    cr.fill();

    cr.save();
    cr.setOperator(Cairo.Operator.CLEAR);
    knockoutContent(cr, body, o);
    cr.restore();
}

function knockoutContent(cr, body, {level, bolt, ds, font = {family: 'Adwaita Sans', weight: SYSTEM_WEIGHT}}) {
    const pad = body.h * 0.15;
    const avail = body.w - 2 * pad;
    const boltH = bolt ? snap(body.h * 0.72, ds) : 0;
    const boltW = boltH * BOLT_ASPECT;
    const gap = bolt ? Math.max(1 / ds, body.h * 0.03) : 0;

    const pl = PangoCairo.create_layout(cr);
    const attrs = new Pango.AttrList();
    attrs.insert(Pango.attr_font_features_new('tnum'));
    pl.set_attributes(attrs);
    pl.set_text(String(level), -1);

    const desc = Pango.FontDescription.new();
    desc.set_family(font.family);
    desc.set_weight(font.weight);

    // Whole device-pixel font sizes keep stems sharp at 1x.
    let size = body.h * 0.8;
    let ink;
    for (let i = 0; i < 5; i++) {
        desc.set_absolute_size(Math.max(1, Math.round(size * ds)) / ds * Pango.SCALE);
        pl.set_font_description(desc);
        [ink] = pl.get_extents();
        const textW = ink.width / Pango.SCALE;
        if (textW + boltW + gap <= avail)
            break;
        size *= (avail - boltW - gap) / textW;
    }
    const inkX = ink.x / Pango.SCALE, inkY = ink.y / Pango.SCALE;
    const inkW = ink.width / Pango.SCALE, inkH = ink.height / Pango.SCALE;

    const groupW = boltW + gap + inkW;
    const x0 = snap(body.x + (body.w - groupW) / 2, ds);

    if (bolt) {
        boltPath(cr, x0, snap(body.y + (body.h - boltH) / 2, ds), boltH);
        cr.fill();
    }

    // show_layout (not layout_path) keeps font hinting → crisper digits at 1x.
    const tx = snap(x0 + boltW + gap - inkX, ds);
    const ty = snap(body.y + (body.h - inkH) / 2 - inkY, ds);
    cr.moveTo(tx, ty);
    PangoCairo.show_layout(cr, pl);
}

/** Fill color for a tone; normal follows the theme foreground. */
export function toneColor(tone, colors, fg) {
    return tone === 'normal' ? [...fg] : [...colors[tone], 1];
}
