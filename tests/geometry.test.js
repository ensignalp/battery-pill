// gjs -m tests/geometry.test.js
import {fillWidth, HEIGHT_MAX, HEIGHT_MIN, layout, parseHex, squirclePath} from '../lib/geometry.js';

let failed = 0;
function ok(name, cond, info = '') {
    if (!cond) {
        failed++;
        print(`FAIL ${name} ${info}`);
    }
}
const onGrid = (v, ds) => Math.abs(v * ds - Math.round(v * ds)) < 1e-9;

for (let preset = HEIGHT_MIN; preset <= HEIGHT_MAX; preset++) {
    for (const ds of [1, 1.25, 1.5, 1.75, 2, 3]) {
        const g = layout(preset, ds);
        const tag = `${preset}@${ds}`;
        for (const [k, v] of Object.entries({
            bw: g.body.w, bh: g.body.h, nx: g.nub.x, ny: g.nub.y, nw: g.nub.w, nh: g.nub.h,
        }))
            ok(`${tag} ${k} on device grid`, onGrid(v, ds), `(${v})`);
        ok(`${tag} nub centered`, Math.abs(g.nub.y * 2 + g.nub.h - g.body.h) < 1e-9);
        ok(`${tag} nub >= 1 device px`, g.nub.w * ds >= 1);
        ok(`${tag} fill 0`, fillWidth(g.body, 0, ds) === 0);
        ok(`${tag} fill 1 visible`, fillWidth(g.body, 1, ds) * ds >= 1);
        ok(`${tag} fill 100 = body`, fillWidth(g.body, 100, ds) === g.body.w);
        ok(`${tag} fill on grid`, onGrid(fillWidth(g.body, 37, ds), ds));
    }
}

// Squircle path stays inside its rect and closes.
const pts = [];
const rec = {
    moveTo: (x, y) => pts.push([x, y]),
    lineTo: (x, y) => pts.push([x, y]),
    curveTo: (a, b, c, d, x, y) => pts.push([a, b], [c, d], [x, y]),
    closePath: () => pts.push('close'),
};
squirclePath(rec, {x: 0, y: 0, w: 25, h: 12, r: 4});
ok('squircle closes', pts.at(-1) === 'close');
ok('squircle in bounds', pts.slice(0, -1).every(([x, y]) => x >= 0 && x <= 25 && y >= 0 && y <= 12));

ok('height clamped low', layout(2, 1).body.h === HEIGHT_MIN);
ok('height clamped high', layout(99, 1).body.h === HEIGHT_MAX);
ok('fractional level fill', fillWidth(layout(14, 1).body, 50.4, 1) === 15);

ok('parseHex', JSON.stringify(parseHex('#FF0000')) === '[1,0,0]');
ok('parseHex invalid', parseHex('red') === null);

print(failed ? `${failed} failed` : 'geometry: all passed');
if (failed)
    imports.system.exit(1);
