import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import St from 'gi://St';

import {SystemIndicator} from 'resource:///org/gnome/shell/ui/quickSettings.js';

import {layout, mix} from './geometry.js';
import {paintBattery, resolveFont, toneColor} from './painter.js';
import {stateKey} from './stateResolver.js';

const TRANSITION_MS = 420;

const BatteryIcon = GObject.registerClass(
class BatteryIcon extends St.DrawingArea {
    _init() {
        super._init({
            style_class: 'bp-icon',
            y_align: Clutter.ActorAlign.CENTER,
            y_expand: true,
        });
        this._state = null;
        this._colors = null;
        this._height = 14;
        this._font = 'default';
        this._textScale = 1;
        this._key = '';
        this._fg = [1, 1, 1, 1];
        // What is on screen; differs from the target only while animating.
        this._shownLevel = 0;
        this._shownColor = null;
        this._fromLevel = 0;
        this._fromColor = null;
        this._timeline = null;

        this._themeContext = St.ThemeContext.get_for_stage(global.stage);
        this._themeContext.connectObject('notify::scale-factor', () => {
            this.queue_relayout();
            this.queue_repaint();
        }, this);
        this.connect('style-changed', () => {
            const c = this.get_theme_node().get_foreground_color();
            this._fg = [c.red / 255, c.green / 255, c.blue / 255, c.alpha / 255];
            if (this._state)
                this._shownColor = this._targetColor();
            this.queue_repaint();
        });
        this.connect('destroy', () => {
            this._stopTimeline();
            this._themeContext.disconnectObject(this);
            this._themeContext = null;
        });
    }

    update(state, colors, height, font, textScale) {
        const key = `${stateKey(state)}|${height}|${colors.key}|${font}|${textScale}`;
        if (key === this._key)
            return;
        this._key = key;

        const first = !this._state;
        const relayout = height !== this._height;
        this._state = state;
        this._colors = colors;
        this._height = height;
        this._font = font;
        this._textScale = textScale;
        if (relayout)
            this.queue_relayout();

        if (first || !St.Settings.get().enable_animations || !this.mapped)
            this._jumpToTarget();
        else
            this._animate();
    }

    _targetColor() {
        return toneColor(this._state.tone, this._colors, this._fg);
    }

    _jumpToTarget() {
        this._stopTimeline();
        this._shownLevel = this._state.level;
        this._shownColor = this._targetColor();
        this.queue_repaint();
    }

    // Event-driven: a timeline exists only for the ~0.4 s after a change.
    _animate() {
        this._stopTimeline();
        this._fromLevel = this._shownLevel;
        this._fromColor = this._shownColor ?? this._targetColor();
        this._timeline = new Clutter.Timeline({actor: this, duration: TRANSITION_MS});
        this._timeline.set_progress_mode(Clutter.AnimationMode.EASE_OUT_CUBIC);
        this._timeline.connect('new-frame', tl => {
            const t = tl.get_progress();
            this._shownLevel = this._fromLevel + (this._state.level - this._fromLevel) * t;
            this._shownColor = mix(this._fromColor, this._targetColor(), t);
            this.queue_repaint();
        });
        this._timeline.connect('completed', () => this._jumpToTarget());
        this._timeline.start();
    }

    _stopTimeline() {
        if (!this._timeline)
            return;
        this._timeline.stop();
        this._timeline = null;
    }

    _scale() {
        return this._themeContext?.scale_factor ?? 1;
    }

    _designSize() {
        const g = layout(this._height, 1);
        return [Math.ceil(g.width), Math.ceil(g.height)];
    }

    vfunc_get_preferred_width(_forHeight) {
        const w = this._designSize()[0] * this._scale();
        return [w, w];
    }

    vfunc_get_preferred_height(_forWidth) {
        const h = this._designSize()[1] * this._scale();
        return [h, h];
    }

    vfunc_repaint() {
        if (!this._state)
            return;
        const cr = this.get_context();
        const [w, h] = this.get_surface_size();
        const k = this._scale(); // actor units per design px
        const rs = this.get_resource_scale();
        const [dw, dh] = this._designSize();

        // Center the design box, snapped to whole device pixels.
        const snapDev = v => Math.round(v * rs) / rs;
        cr.translate(snapDev((w - dw * k) / 2), snapDev((h - dh * k) / 2));
        cr.scale(k, k);
        paintBattery(cr, {
            height: this._height,
            ds: k * rs,
            fg: this._fg,
            fillColor: this._shownColor ?? this._targetColor(),
            fillLevel: this._shownLevel,
            level: this._state.level,
            bolt: this._state.bolt,
            font: resolveFont(this._font, this.get_theme_node().get_font()?.get_family()),
            textScale: this._textScale,
        });
        cr.$dispose();
    }
    // Resource-scale changes (moving between monitors) are handled by
    // St.DrawingArea itself, which re-creates the surface and repaints.
});

const TONE_TEXT = {
    charging: 'şarj oluyor',
    low: 'düşük pil',
    saver: 'güç tasarrufu',
    normal: '',
};

export const BatteryIndicator = GObject.registerClass(
class BatteryIndicator extends SystemIndicator {
    _init() {
        super._init();
        this.add_style_class_name('bp-indicator');
        this._icon = new BatteryIcon();
        this.add_child(this._icon);
    }

    setState(state, colors, height, font, textScale) {
        this.visible = state.visible;
        if (!state.visible)
            return;
        for (const tone of Object.keys(TONE_TEXT))
            this[tone === state.tone ? 'add_style_class_name' : 'remove_style_class_name'](tone);
        this._icon.update(state, colors, height, font, textScale);
        const extra = TONE_TEXT[state.tone];
        this.accessible_name = `Pil %${state.level}${extra ? `, ${extra}` : ''}`;
    }
});
