// Debug only: drive the indicator from a JSON file, event-driven via FileMonitor.
// File: {"percent": 12, "state": 2, "present": true, "profile": "power-saver"}
import Gio from 'gi://Gio';

export class MockSource {
    constructor(path, onChange) {
        this._onChange = onChange;
        this._file = Gio.File.new_for_path(path);
        this._data = null;
        this._monitor = this._file.monitor_file(Gio.FileMonitorFlags.NONE, null);
        this._monitor.connect('changed', (_m, _f, _o, event) => {
            if (event === Gio.FileMonitorEvent.CHANGES_DONE_HINT ||
                event === Gio.FileMonitorEvent.CREATED ||
                event === Gio.FileMonitorEvent.DELETED)
                this._load();
        });
        this._load();
    }

    _load() {
        try {
            const [, bytes] = this._file.load_contents(null);
            this._data = JSON.parse(new TextDecoder().decode(bytes));
        } catch (e) {
            this._data = null;
            if (!e.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.NOT_FOUND))
                console.warn(`[battery-pill] mock: ${e.message}`);
        }
        this._onChange?.();
    }

    get battery() {
        const d = this._data;
        if (!d)
            return null;
        return {present: d.present ?? true, state: d.state ?? 2, percent: d.percent ?? 50};
    }

    get profile() {
        return this._data?.profile;
    }

    destroy() {
        this._monitor.cancel();
        this._monitor = null;
        this._onChange = null;
    }
}
