// UPower DisplayDevice, signal-driven (no polling).
import Gio from 'gi://Gio';

const BUS_NAME = 'org.freedesktop.UPower';
const OBJECT_PATH = '/org/freedesktop/UPower/devices/DisplayDevice';
const IFACE = `<node><interface name="org.freedesktop.UPower.Device">
  <property name="Percentage" type="d" access="read"/>
  <property name="State" type="u" access="read"/>
  <property name="IsPresent" type="b" access="read"/>
  <property name="TimeToEmpty" type="x" access="read"/>
  <property name="TimeToFull" type="x" access="read"/>
</interface></node>`;
const DeviceProxy = Gio.DBusProxy.makeProxyWrapper(IFACE);
const RELEVANT = ['Percentage', 'State', 'IsPresent'];

export class PowerSource {
    constructor(onChange) {
        this._onChange = onChange;
        this._cancellable = new Gio.Cancellable();
        this._proxy = null;

        new DeviceProxy(Gio.DBus.system, BUS_NAME, OBJECT_PATH, (proxy, error) => {
            if (error) {
                if (!error.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED))
                    console.error(`[battery-pill] UPower: ${error.message}`);
                return;
            }
            if (!this._onChange) // destroyed before init finished
                return;
            this._proxy = proxy;
            proxy.connectObject(
                'g-properties-changed', (_p, changed) => {
                    const keys = Object.keys(changed.deepUnpack());
                    if (keys.some(k => RELEVANT.includes(k)))
                        this._onChange?.();
                },
                // UPower restarted or vanished
                'notify::g-name-owner', () => this._onChange?.(),
                this);
            this._onChange();
        }, this._cancellable);
    }

    get snapshot() {
        const p = this._proxy;
        if (!p?.g_name_owner)
            return null;
        return {
            present: Boolean(p.IsPresent),
            state: p.State ?? 0,
            percent: p.Percentage ?? 0,
            timeToEmpty: p.TimeToEmpty ?? 0,
            timeToFull: p.TimeToFull ?? 0,
        };
    }

    destroy() {
        this._cancellable.cancel();
        this._proxy?.disconnectObject(this);
        this._proxy = null;
        this._onChange = null;
    }
}
