// Renders the README hero image with the real painter.
// Usage: gjs -m tools/render-hero.js [out.png]
import Cairo from 'cairo';
import Pango from 'gi://Pango';
import PangoCairo from 'gi://PangoCairo';
import System from 'system';

import {layout, parseHex} from '../lib/geometry.js';
import {paintBattery, resolveFont, toneColor} from '../lib/painter.js';

const out = System.programArgs[0] ?? 'docs/hero.png';
const S = 2;                     // output scale
const W = 880, H = 300;          // design px
const colors = {charging: parseHex('#10B981'), low: parseHex('#FF453A'), saver: parseHex('#FFD60A')};
const fg = [1, 1, 1, 1];
const font = resolveFont('default', 'Adwaita Sans');
const items = [
    {label: 'Normal', st: {tone: 'normal', level: 72, bolt: false}},
    {label: 'Power Saver', st: {tone: 'saver', level: 48, bolt: false}},
    {label: 'Low Battery', st: {tone: 'low', level: 12, bolt: false}},
    {label: 'Charging', st: {tone: 'charging', level: 64, bolt: true}},
];

const surface = new Cairo.ImageSurface(Cairo.Format.ARGB32, W * S, H * S);
const cr = new Cairo.Context(surface);
cr.scale(S, S);

// background: soft vertical gradient, rounded card
const r = 28;
cr.newSubPath();
cr.arc(W - r, r, r, -Math.PI / 2, 0);
cr.arc(W - r, H - r, r, 0, Math.PI / 2);
cr.arc(r, H - r, r, Math.PI / 2, Math.PI);
cr.arc(r, r, r, Math.PI, 1.5 * Math.PI);
cr.closePath();
const bg = new Cairo.LinearGradient(0, 0, 0, H);
bg.addColorStopRGB(0, 0.13, 0.13, 0.15);
bg.addColorStopRGB(1, 0.07, 0.07, 0.08);
cr.setSource(bg);
cr.fill();

function text(str, x, y, size, weight, alpha, center = true) {
    const pl = PangoCairo.create_layout(cr);
    const d = Pango.FontDescription.new();
    d.set_family(font.family);
    d.set_weight(weight);
    d.set_absolute_size(size * Pango.SCALE);
    pl.set_font_description(d);
    pl.set_text(str, -1);
    const [, log] = pl.get_pixel_extents();
    cr.setSourceRGBA(1, 1, 1, alpha);
    cr.moveTo(center ? x - log.width / 2 : x, y);
    PangoCairo.show_layout(cr, pl);
}

text('Battery Pill', W / 2, 30, 34, Pango.Weight.BOLD, 1);
text('A crisp, phone-style battery for the GNOME top bar', W / 2, 78, 16, Pango.Weight.NORMAL, 0.6);

// a top-bar strip holding the four states
const stripY = 130, stripH = 110;
const height = 22;               // big, for the hero
const g = layout(height, S);
const step = (W - 80) / items.length;
items.forEach(({label, st}, i) => {
    const cx = 40 + step * i + step / 2;
    const layer = new Cairo.ImageSurface(Cairo.Format.ARGB32, Math.ceil(g.width * S), Math.ceil(g.height * S));
    const lc = new Cairo.Context(layer);
    lc.scale(S, S);
    paintBattery(lc, {
        height, ds: S, fg, fillColor: toneColor(st.tone, colors, fg),
        fillLevel: st.level, level: st.level, bolt: st.bolt, font,
    });
    lc.$dispose();
    cr.save();
    cr.translate(Math.round(cx - g.width / 2), stripY + 18);
    cr.scale(1 / S, 1 / S);
    cr.setSourceSurface(layer, 0, 0);
    cr.paint();
    cr.restore();
    text(label, cx, stripY + 62, 14, Pango.Weight.MEDIUM, 0.75);
});
text('Emerald while charging · red at low battery · yellow in power saver', W / 2, stripH + stripY + 14, 13, Pango.Weight.NORMAL, 0.45);

cr.$dispose();
surface.writeToPNG(out);
print(out);
