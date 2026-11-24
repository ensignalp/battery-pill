// Hides the built-in panel battery icon and restores it exactly on disable.
// Stock Indicator._sync() rewrites _percentageLabel.visible on every update,
// so a one-off hide() is not enough: we wrap _sync on that single instance.
import {InjectionManager} from 'resource:///org/gnome/shell/extensions/extension.js';

function apply(sys) {
    if (sys._systemItem?.powerToggle?.visible) {
        sys._percentageLabel.hide();
        sys._indicator.hide();
    } else {
        // No battery: keep the stock power icon.
        sys._indicator.show();
    }
    sys._syncIndicatorsVisible();
}

export class StockIndicator {
    hide(sys) {
        if (!sys?._indicator || !sys._percentageLabel || typeof sys._sync !== 'function') {
            console.warn('[battery-pill] stock indicator internals changed; not hiding it');
            return;
        }
        this._sys = sys;
        this._im = new InjectionManager();
        this._im.overrideMethod(sys, '_sync', orig => function (...args) {
            orig.apply(this, args);
            apply(this);
        });
        apply(sys);
    }

    restore() {
        if (!this._sys)
            return;
        this._im.clear();
        this._im = null;
        this._sys._indicator.show();
        this._sys._sync();
        this._sys._syncIndicatorsVisible();
        this._sys = null;
    }
}
