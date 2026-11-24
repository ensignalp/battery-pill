import GLib from 'gi://GLib';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

import {parseHex} from './lib/geometry.js';
import {BatteryIndicator} from './lib/indicator.js';
import {MockSource} from './lib/mockSource.js';
import {PowerSource} from './lib/powerSource.js';
import {ProfileSource} from './lib/profileSource.js';
import {resolve} from './lib/stateResolver.js';
import {StockIndicator} from './lib/stockIndicator.js';

const FALLBACK_COLORS = {charging: '#10B981', low: '#FF453A', saver: '#FFD60A'};

export default class BatteryPillExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._indicator = new BatteryIndicator();
        this._stock = new StockIndicator();
        this._readSettings();

        this._power = new PowerSource(() => this._update());
        this._profile = new ProfileSource(() => this._update());
        this._syncMock();

        this._settings.connectObject('changed', (_s, key) => {
            if (key === 'mock-file')
                this._syncMock();
            else if (key === 'hide-stock-indicator')
                this._syncStock();
            this._readSettings();
            this._update();
        }, this);

        this._attach();
    }

    disable() {
        if (this._attachId) {
            GLib.source_remove(this._attachId);
            this._attachId = 0;
        }
        this._settings.disconnectObject(this);
        this._stock.restore();
        this._indicator.destroy();
        this._power.destroy();
        this._profile.destroy();
        this._mock?.destroy();

        this._settings = null;
        this._indicator = null;
        this._stock = null;
        this._power = null;
        this._profile = null;
        this._mock = null;
        this._qs = null;
    }

    // quickSettings._system is created after an await in _setupIndicators(),
    // so at session start it may not exist yet. Retry briefly, then give up.
    _attach() {
        const qs = Main.panel.statusArea.quickSettings;
        if (qs?._system) {
            this._finishAttach(qs);
            return;
        }
        let tries = 0;
        this._attachId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 100, () => {
            const q = Main.panel.statusArea.quickSettings;
            if (q?._system) {
                this._attachId = 0;
                this._finishAttach(q);
                return GLib.SOURCE_REMOVE;
            }
            if (++tries >= 100) {
                this._attachId = 0;
                console.error('[battery-pill] quick settings never became ready');
                return GLib.SOURCE_REMOVE;
            }
            return GLib.SOURCE_CONTINUE;
        });
    }

    _finishAttach(qs) {
        this._qs = qs;
        qs.addExternalIndicator(this._indicator);
        // Take the stock battery's slot (right after it in the indicator box).
        qs._indicators.set_child_above_sibling(this._indicator, qs._system);
        this._syncStock();
        this._update();
    }

    _syncStock() {
        if (!this._qs)
            return;
        this._stock.restore();
        if (this._settings.get_boolean('hide-stock-indicator'))
            this._stock.hide(this._qs._system);
    }

    _syncMock() {
        this._mock?.destroy();
        this._mock = null;
        const path = this._settings.get_string('mock-file');
        if (path)
            this._mock = new MockSource(path, () => this._update());
    }

    _readSettings() {
        const s = this._settings;
        const hex = {};
        const colors = {};
        for (const tone of ['charging', 'low', 'saver']) {
            hex[tone] = s.get_string(`color-${tone}`);
            colors[tone] = parseHex(hex[tone]) ?? parseHex(FALLBACK_COLORS[tone]);
        }
        colors.key = `${hex.charging}${hex.low}${hex.saver}`;
        this._colors = colors;
        this._height = s.get_int('icon-height');
        this._font = s.get_string('font');
        this._textScale = s.get_int('text-scale') / 100;
        this._lowThreshold = s.get_int('low-threshold');
    }

    _update() {
        if (!this._indicator)
            return;
        const battery = this._mock?.battery ?? this._power?.snapshot ?? null;
        const profile = this._mock?.profile ?? this._profile?.active ?? null;
        const state = resolve(battery, profile, {lowThreshold: this._lowThreshold});
        this._indicator.setState(state, this._colors, this._height, this._font, this._textScale);
    }
}
