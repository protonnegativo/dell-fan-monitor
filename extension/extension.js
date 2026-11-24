// SPDX-License-Identifier: GPL-3.0-or-later

import GObject from 'gi://GObject';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import St from 'gi://St';
import Clutter from 'gi://Clutter';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import {Extension, gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';

const HELPER = '/usr/local/sbin/dell-fan-monitor-helper';
const STATE_FILE = '/run/dell-fan-monitor';
const PROFILE_FILE = '/sys/firmware/acpi/platform_profile';
const PROFILE_CHOICES_FILE = '/sys/firmware/acpi/platform_profile_choices';
const INTERVAL_S = 3;

// With the fan forced to "low" the firmware no longer controls it, so hand
// control back once the CPU gets this hot.
const SAFE_TEMP_C = 88;

function readText(path) {
    try {
        const [ok, bytes] = GLib.file_get_contents(path);
        return ok ? new TextDecoder().decode(bytes).trim() : null;
    } catch (_e) {
        return null;
    }
}

function findHwmon(name) {
    for (let i = 0; i < 32; i++) {
        const dir = `/sys/class/hwmon/hwmon${i}`;
        if (readText(`${dir}/name`) === name)
            return dir;
    }
    return null;
}

function fanModes() {
    return [
        ['auto', _('Automatic')],
        ['low', _('Low')],
        ['high', _('Maximum')],
    ];
}

function profileLabel(profile) {
    const known = {
        'cool': _('Cool'),
        'quiet': _('Quiet'),
        'balanced': _('Balanced'),
        'performance': _('Performance'),
        'low-power': _('Low power'),
        'balanced-performance': _('Balanced performance'),
    };
    return known[profile] ?? profile;
}

const Indicator = GObject.registerClass(
class Indicator extends PanelMenu.Button {
    _init() {
        super._init(0.5, _('Dell Fan Monitor'));

        this._label = new St.Label({
            text: '…',
            y_align: Clutter.ActorAlign.CENTER,
        });
        this.add_child(this._label);

        this._coretemp = findHwmon('coretemp');
        this._dellSmm = findHwmon('dell_smm');
        this._prevCpu = null;

        const helperInstalled = GLib.file_test(HELPER, GLib.FileTest.IS_EXECUTABLE);
        const canSetFan = helperInstalled && this._dellSmm !== null &&
            GLib.file_test(`${this._dellSmm}/pwm1`, GLib.FileTest.EXISTS);
        const profiles = (readText(PROFILE_CHOICES_FILE) ?? '').split(/\s+/).filter(p => p);

        this._cpuItem = this._addInfo();
        this._ramItem = this._addInfo();
        this._tempItem = this._addInfo();
        this._fanItem = this._addInfo();
        this._fanItem.visible = this._dellSmm !== null;

        this._fanItems = new Map();
        if (canSetFan) {
            this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem(_('Fan')));
            for (const [mode, text] of fanModes()) {
                const item = new PopupMenu.PopupMenuItem(text);
                item.connect('activate', () => this._run(['fan', mode]));
                this.menu.addMenuItem(item);
                this._fanItems.set(mode, item);
            }
        }

        this._profileItems = new Map();
        if (helperInstalled && profiles.length > 0) {
            this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem(_('Thermal profile')));
            for (const profile of profiles) {
                const item = new PopupMenu.PopupMenuItem(profileLabel(profile));
                item.connect('activate', () => this._run(['profile', profile]));
                this.menu.addMenuItem(item);
                this._profileItems.set(profile, item);
            }
        }

        if (!helperInstalled) {
            this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
            this._addInfo().label.text =
                _('Install the helper to change fan speed and thermal profile');
        }

        this._update();
        this._timer = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, INTERVAL_S, () => {
            this._update();
            return GLib.SOURCE_CONTINUE;
        });
    }

    _addInfo() {
        const item = new PopupMenu.PopupMenuItem('', {reactive: false});
        this.menu.addMenuItem(item);
        return item;
    }

    _run(args) {
        try {
            const proc = Gio.Subprocess.new(['pkexec', HELPER, ...args], Gio.SubprocessFlags.NONE);
            proc.wait_async(null, () => {
                if (this._timer)
                    this._update();
            });
        } catch (e) {
            Main.notify(_('Dell Fan Monitor'), e.message);
        }
    }

    _cpuPercent() {
        const line = (readText('/proc/stat') ?? '').split('\n')[0];
        const v = line.trim().split(/\s+/).slice(1).map(Number);
        if (v.length < 5)
            return null;
        const idle = v[3] + v[4];
        const total = v.reduce((a, b) => a + b, 0);
        const prev = this._prevCpu;
        this._prevCpu = {idle, total};
        if (!prev || total === prev.total)
            return null;
        return Math.round(100 * (1 - (idle - prev.idle) / (total - prev.total)));
    }

    _ram() {
        const text = readText('/proc/meminfo') ?? '';
        const get = key => Number((text.match(new RegExp(`^${key}:\\s+(\\d+)`, 'm')) ?? [])[1] ?? 0);
        const total = get('MemTotal');
        const avail = get('MemAvailable');
        if (!total)
            return null;
        return {
            pct: Math.round(100 * (total - avail) / total),
            usedGb: (total - avail) / 1048576,
            totalGb: total / 1048576,
        };
    }

    _update() {
        const raw = this._coretemp ? Number(readText(`${this._coretemp}/temp1_input`)) : NaN;
        const temp = Number.isFinite(raw) && raw > 0 ? Math.round(raw / 1000) : null;
        const ram = this._ram();
        const cpu = this._cpuPercent();

        const parts = [];
        if (temp !== null)
            parts.push(`${temp}°C`);
        if (ram)
            parts.push(_('RAM %d%%').format(ram.pct));
        this._label.text = parts.join('  ·  ') || '—';

        this._cpuItem.label.text = _('CPU: %s').format(cpu === null ? '…' : `${cpu}%`);
        this._ramItem.label.text = ram
            ? _('RAM: %s of %s GB (%d%%)').format(ram.usedGb.toFixed(1), ram.totalGb.toFixed(1), ram.pct)
            : _('RAM: %s').format('—');
        this._tempItem.label.text = _('Temperature: %s').format(temp === null ? '—' : `${temp} °C`);

        if (this._dellSmm) {
            const fans = [];
            for (const n of [1, 2, 3]) {
                const rpm = readText(`${this._dellSmm}/fan${n}_input`);
                if (rpm !== null)
                    fans.push(_('%s rpm').format(rpm));
            }
            this._fanItem.label.text = _('Fans: %s').format(fans.length ? fans.join(' / ') : '—');
        }

        const fanMode = readText(STATE_FILE) ?? 'auto';
        for (const [mode, item] of this._fanItems)
            item.setOrnament(mode === fanMode ? PopupMenu.Ornament.DOT : PopupMenu.Ornament.NONE);

        const profile = readText(PROFILE_FILE);
        for (const [p, item] of this._profileItems)
            item.setOrnament(p === profile ? PopupMenu.Ornament.DOT : PopupMenu.Ornament.NONE);

        if (fanMode === 'low' && temp !== null && temp >= SAFE_TEMP_C) {
            this._run(['fan', 'auto']);
            Main.notify(_('Dell Fan Monitor'),
                _('CPU at %d °C: the fan is back on automatic control.').format(temp));
        }
    }

    destroy() {
        if (this._timer) {
            GLib.source_remove(this._timer);
            this._timer = null;
        }
        super.destroy();
    }
});

export default class DellFanMonitor extends Extension {
    enable() {
        this._indicator = new Indicator();
        Main.panel.addToStatusArea(this.uuid, this._indicator, 0, 'right');
    }

    disable() {
        this._indicator?.destroy();
        this._indicator = null;
    }
}
