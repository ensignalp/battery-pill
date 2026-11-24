// Test-only helper loaded by tools/shell-shot.sh inside a headless GNOME Shell.
// Cycles the mock state, screenshots the panel's right side, then quits.
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Shell from 'gi://Shell';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

Gio._promisify(Shell.Screenshot.prototype, 'screenshot_area');

const wait = ms => new Promise(r => GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => {
    r();
    return GLib.SOURCE_REMOVE;
}));

export default class ShotHelper extends Extension {
    enable() {
        this._run().catch(e => console.error(`[shot-helper] ${e}\n${e.stack}`))
            .finally(() => global.context.terminate());
    }

    disable() {}

    async _run() {
        const out = GLib.getenv('BP_SHOT_DIR');
        const mock = GLib.getenv('BP_MOCK_FILE');
        const states = JSON.parse(GLib.getenv('BP_STATES'));
        await wait(2500);
        const panel = Main.panel;
        const [, , pw] = [0, 0, global.stage.width];
        const w = Number(GLib.getenv('BP_SHOT_W') || 260), h = panel.height;
        for (const [i, s] of states.entries()) {
            Gio.File.new_for_path(mock).replace_contents(
                new TextEncoder().encode(JSON.stringify(s)), null, false,
                Gio.FileCreateFlags.REPLACE_DESTINATION, null);
            await wait(700);
            const file = Gio.File.new_for_path(`${out}/${String(i).padStart(2, '0')}.png`);
            const stream = file.replace(null, false, Gio.FileCreateFlags.NONE, null);
            await new Shell.Screenshot().screenshot_area(pw - w, 0, w, h, stream);
            stream.close(null);
        }
    }
}
