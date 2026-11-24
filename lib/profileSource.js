// Active power profile from power-profiles-daemon / tuned-ppd.
// Watches both bus names and follows the daemon across restarts.
import Gio from 'gi://Gio';

const SERVICES = [
    {name: 'org.freedesktop.UPower.PowerProfiles', path: '/org/freedesktop/UPower/PowerProfiles'},
    {name: 'net.hadess.PowerProfiles', path: '/net/hadess/PowerProfiles'},
].map(s => ({
    ...s,
    Proxy: Gio.DBusProxy.makeProxyWrapper(`<node><interface name="${s.name}">
      <property name="ActiveProfile" type="s" access="read"/>
    </interface></node>`),
}));

export class ProfileSource {
    constructor(onChange) {
        this._onChange = onChange;
        this._owned = new Set();
        this._service = null;
        this._proxy = null;
        this._cancellable = null;

        this._watchIds = SERVICES.map(s => Gio.bus_watch_name(
            Gio.BusType.SYSTEM, s.name, Gio.BusNameWatcherFlags.NONE,
            () => { this._owned.add(s.name); this._reconnect(); },
            () => { this._owned.delete(s.name); this._reconnect(); }));
    }

    get active() {
        return this._proxy?.ActiveProfile ?? null;
    }

    _reconnect() {
        const wanted = SERVICES.find(s => this._owned.has(s.name)) ?? null;
        if (wanted === this._service)
            return;

        this._drop();
        this._service = wanted;
        if (!wanted) {
            this._onChange?.();
            return;
        }

        this._cancellable = new Gio.Cancellable();
        new wanted.Proxy(Gio.DBus.system, wanted.name, wanted.path, (proxy, error) => {
            if (error) {
                if (!error.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED))
                    console.error(`[battery-pill] ${wanted.name}: ${error.message}`);
                return;
            }
            this._proxy = proxy;
            proxy.connectObject('g-properties-changed', (_p, changed) => {
                if ('ActiveProfile' in changed.deepUnpack())
                    this._onChange?.();
            }, this);
            this._onChange?.();
        }, this._cancellable);
    }

    _drop() {
        this._cancellable?.cancel();
        this._cancellable = null;
        this._proxy?.disconnectObject(this);
        this._proxy = null;
    }

    destroy() {
        this._watchIds.forEach(id => Gio.bus_unwatch_name(id));
        this._watchIds = [];
        this._drop();
        this._service = null;
        this._onChange = null;
    }
}
