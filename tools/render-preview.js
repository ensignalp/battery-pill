// Renders every state at several sizes/scales into a PNG sheet for review.
// Usage: gjs -m tools/render-preview.js [out.png] [default|system]
import Cairo from 'cairo';
import System from 'system';

import {paintBattery, resolveFont, toneColor} from '../lib/painter.js';
import {layout, parseHex} from '../lib/geometry.js';

const out = System.programArgs[0] ?? '/tmp/bp-preview.png';
const font = resolveFont(System.programArgs[1] ?? 'default', 'Adwaita Sans');
print(`font: ${font.family} ${font.weight}`);
const colors = {charging: parseHex('#10B981'), low: parseHex('#FF453A'), saver: parseHex('#FFD60A')};
const states = [
    {tone: 'normal', level: 72, bolt: false},
    {tone: 'saver', level: 48, bolt: false},
    {tone: 'low', level: 12, bolt: false},
    {tone: 'low', level: 5, bolt: false},
    {tone: 'charging', level: 64, bolt: true},
    {tone: 'charging', level: 100, bolt: true},
];
const rows = [[12, 1], [14, 1], [16, 1], [18, 1], [14, 1.25], [14, 2]];
const fg = [1, 1, 1, 1];
const cellW = 46, rowPad = 8;

const rowH = rows.map(([h, s]) => Math.ceil((h + rowPad) * s));
const sheetW = Math.ceil(states.length * cellW * 2);
const sheet = new Cairo.ImageSurface(Cairo.Format.ARGB32, sheetW, rowH.reduce((a, b) => a + b, 0));
const sc = new Cairo.Context(sheet);
sc.setSourceRGB(0.13, 0.13, 0.145);
sc.paint();

let y = 0;
rows.forEach(([height, s], ri) => {
    states.forEach((st, ci) => {
        const g = layout(height, s);
        const w = Math.ceil(g.width * s), h = Math.ceil(g.height * s);
        const layer = new Cairo.ImageSurface(Cairo.Format.ARGB32, w, h);
        const cr = new Cairo.Context(layer);
        cr.scale(s, s);
        paintBattery(cr, {
            height, ds: s, fg, fillColor: toneColor(st.tone, colors, fg),
            fillLevel: st.level, level: st.level, bolt: st.bolt, font,
        });
        cr.$dispose();
        sc.setSourceSurface(layer, Math.round(ci * cellW * s + 6 * s), y + Math.round((rowH[ri] - h) / 2));
        sc.paint();
    });
    y += rowH[ri];
});
sheet.writeToPNG(out);
sc.$dispose();
print(out);
