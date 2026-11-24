import Adw from 'gi://Adw';
import Cairo from 'cairo';
import Gdk from 'gi://Gdk';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {HEIGHT_DEFAULT, HEIGHT_MAX, HEIGHT_MIN, layout, parseHex} from './lib/geometry.js';
import {DEFAULT_FAMILY, hasFamily, paintBattery, resolveFont, toneColor} from './lib/painter.js';

const COLORS = [
    ['color-charging', 'Şarj oluyor'],
    ['color-low', 'Düşük pil'],
    ['color-saver', 'Güç tasarrufu'],
];
const FONTS = [
    ['default', `${DEFAULT_FAMILY} Bold`],
    ['system', 'Sistem'],
];
const PREVIEW = [
    {tone: 'normal', level: 72, bolt: false},
    {tone: 'saver', level: 48, bolt: false},
    {tone: 'low', level: 12, bolt: false},
    {tone: 'charging', level: 64, bolt: true},
];

function toHex(rgba) {
    const h = v => Math.round(v * 255).toString(16).padStart(2, '0');
    return `#${h(rgba.red)}${h(rgba.green)}${h(rgba.blue)}`.toUpperCase();
}

/** Live preview on a panel-colored strip, drawn with the same painter as the panel. */
function buildPreview(settings) {
    const area = new Gtk.DrawingArea({content_height: 64, hexpand: true});
    area.set_draw_func((_a, cr, width, height) => {
        const ds = area.get_native()?.get_surface()?.get_scale?.() ?? area.get_scale_factor();
        const h = settings.get_int('icon-height');
        const font = resolveFont(settings.get_string('font'), Gtk.Settings.get_default()
            .gtk_font_name?.replace(/\s+\d+(\.\d+)?$/, ''));
        const fg = [1, 1, 1, 1];
        const colors = {};
        for (const tone of ['charging', 'low', 'saver'])
            colors[tone] = parseHex(settings.get_string(`color-${tone}`)) ?? [1, 1, 1];

        // Panel strip
        const r = 12;
        cr.newSubPath();
        cr.arc(width - r, r, r, -Math.PI / 2, 0);
        cr.arc(width - r, height - r, r, 0, Math.PI / 2);
        cr.arc(r, height - r, r, Math.PI / 2, Math.PI);
        cr.arc(r, r, r, Math.PI, 1.5 * Math.PI);
        cr.closePath();
        cr.setSourceRGB(0.11, 0.11, 0.12);
        cr.fill();

        const g = layout(h, ds);
        const step = width / PREVIEW.length;
        PREVIEW.forEach((st, i) => {
            // Paint on a transparent layer so the knockout shows the strip.
            const lw = Math.ceil(g.width * ds), lh = Math.ceil(g.height * ds);
            const layer = new Cairo.ImageSurface(Cairo.Format.ARGB32, lw, lh);
            const lc = new Cairo.Context(layer);
            lc.scale(ds, ds);
            paintBattery(lc, {
                height: h, ds, fg, fillColor: toneColor(st.tone, colors, fg),
                fillLevel: st.level, level: st.level, bolt: st.bolt, font,
            });
            lc.$dispose();

            const x = Math.round((step * i + (step - g.width) / 2) * ds) / ds;
            const y = Math.round((height - g.height) / 2 * ds) / ds;
            cr.save();
            cr.translate(x, y);
            cr.scale(1 / ds, 1 / ds);
            cr.setSourceSurface(layer, 0, 0);
            cr.paint();
            cr.restore();
        });
    });
    settings.connect('changed', () => area.queue_draw());
    return area;
}

export default class BatteryPillPrefs extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        window.set_default_size(560, 640);
        const page = new Adw.PreferencesPage();
        window.add(page);

        const look = new Adw.PreferencesGroup({title: 'Görünüm'});
        page.add(look);

        const previewRow = new Adw.PreferencesRow({activatable: false});
        const previewBox = new Gtk.Box({margin_top: 12, margin_bottom: 12, margin_start: 12, margin_end: 12});
        previewBox.append(buildPreview(settings));
        previewRow.set_child(previewBox);
        look.add(previewRow);

        const sizeRow = new Adw.ActionRow({title: 'Boyut', subtitle: `Gövde yüksekliği (varsayılan ${HEIGHT_DEFAULT} px)`});
        const scale = new Gtk.Scale({
            orientation: Gtk.Orientation.HORIZONTAL,
            adjustment: new Gtk.Adjustment({lower: HEIGHT_MIN, upper: HEIGHT_MAX, step_increment: 1, page_increment: 2}),
            digits: 0,
            draw_value: true,
            value_pos: Gtk.PositionType.LEFT,
            round_digits: 0,
            hexpand: true,
            width_request: 220,
            valign: Gtk.Align.CENTER,
        });
        for (const v of [12, HEIGHT_DEFAULT, 16, 18, 20])
            scale.add_mark(v, Gtk.PositionType.BOTTOM, null);
        settings.bind('icon-height', scale.adjustment, 'value', Gio.SettingsBindFlags.DEFAULT);
        sizeRow.add_suffix(scale);
        look.add(sizeRow);

        const installed = hasFamily(DEFAULT_FAMILY);
        const fontRow = new Adw.ComboRow({
            title: 'Yazı tipi',
            subtitle: installed
                ? `Varsayılan: ${DEFAULT_FAMILY} Bold 700`
                : `${DEFAULT_FAMILY} kurulu değil; sistem yazı tipi kullanılıyor`,
            model: Gtk.StringList.new(FONTS.map(([, label]) => label)),
        });
        const syncFont = () => {
            fontRow.selected = Math.max(0, FONTS.findIndex(([id]) => id === settings.get_string('font')));
        };
        syncFont();
        fontRow.connect('notify::selected', () => {
            const id = FONTS[fontRow.selected][0];
            if (id !== settings.get_string('font'))
                settings.set_string('font', id);
        });
        settings.connect('changed::font', syncFont);
        look.add(fontRow);

        const low = new Adw.SpinRow({
            title: 'Düşük pil eşiği',
            subtitle: 'Bu yüzde ve altında kırmızı',
            adjustment: new Gtk.Adjustment({lower: 5, upper: 30, step_increment: 1}),
        });
        settings.bind('low-threshold', low, 'value', Gio.SettingsBindFlags.DEFAULT);
        look.add(low);

        const colors = new Adw.PreferencesGroup({
            title: 'Renkler',
            description: 'Normal durum her zaman panelin yazı rengini (beyaz) kullanır.',
        });
        page.add(colors);
        for (const [key, title] of COLORS) {
            const row = new Adw.ActionRow({title});
            const button = new Gtk.ColorDialogButton({
                dialog: new Gtk.ColorDialog({with_alpha: false}),
                valign: Gtk.Align.CENTER,
            });
            const sync = () => {
                const rgba = new Gdk.RGBA();
                if (rgba.parse(settings.get_string(key)))
                    button.rgba = rgba;
            };
            sync();
            button.connect('notify::rgba', () => {
                const hex = toHex(button.rgba);
                if (hex !== settings.get_string(key).toUpperCase())
                    settings.set_string(key, hex);
            });
            const reset = new Gtk.Button({
                icon_name: 'edit-undo-symbolic',
                tooltip_text: 'Varsayılana dön',
                valign: Gtk.Align.CENTER,
                css_classes: ['flat'],
            });
            reset.connect('clicked', () => {
                settings.reset(key);
                sync();
            });
            row.add_suffix(button);
            row.add_suffix(reset);
            colors.add(row);
        }

        const behavior = new Adw.PreferencesGroup({title: 'Davranış'});
        page.add(behavior);
        const stock = new Adw.SwitchRow({
            title: 'Varsayılan pil simgesini gizle',
            subtitle: 'Kapatılırsa iki gösterge yan yana görünür',
        });
        settings.bind('hide-stock-indicator', stock, 'active', Gio.SettingsBindFlags.DEFAULT);
        behavior.add(stock);
    }
}
