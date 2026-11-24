#!/usr/bin/env bash
# Screenshots the real extension inside an isolated headless GNOME Shell.
# Does not touch the running session. Output: a stacked PNG of every state.
# Usage: tools/shell-shot.sh [out.png] [scale]   (scale: 1 or 2)
set -euo pipefail
here="$(cd "$(dirname "$0")/.." && pwd)"
out="${1:-/tmp/bp-shell.png}"
scale="${2:-1}"
tmp="$(mktemp -d /tmp/bp-shell.XXXXXX)"
trap 'rm -rf "$tmp"' EXIT

mkdir -p "$tmp"/{data/gnome-shell/extensions,config/glib-2.0/settings,config/monitors,cache,runtime,shots}
chmod 700 "$tmp/runtime"
ln -s "$here" "$tmp/data/gnome-shell/extensions/battery-pill@ensignalp"
ln -s "$here/tools/shot-helper@battery-pill" "$tmp/data/gnome-shell/extensions/shot-helper@battery-pill"
# user fonts (e.g. SF Pro Text) live under XDG_DATA_HOME, which is replaced here
[[ -d "$HOME/.local/share/fonts" ]] && ln -s "$HOME/.local/share/fonts" "$tmp/data/fonts"

cat > "$tmp/config/glib-2.0/settings/keyfile" <<EOF
[org/gnome/shell]
enabled-extensions=['battery-pill@ensignalp', 'shot-helper@battery-pill']
disable-user-extensions=false
welcome-dialog-last-shown-version='999'

[org/gnome/desktop/interface]
scaling-factor=uint32 $scale

[org/gnome/shell/extensions/battery-pill]
mock-file='$tmp/mock.json'
EOF
echo '{"percent":72,"state":2}' > "$tmp/mock.json"

if [[ "$scale" == 2 ]]; then mode=2560x1600; else mode=1280x800; fi

export BP_SHOT_DIR="$tmp/shots" BP_MOCK_FILE="$tmp/mock.json" BP_SHOT_W="$((260 * scale))"
export BP_STATES='[
 {"percent":72,"state":2,"profile":"balanced"},
 {"percent":48,"state":2,"profile":"power-saver"},
 {"percent":12,"state":2,"profile":"power-saver"},
 {"percent":64,"state":1,"profile":"power-saver"},
 {"percent":100,"state":4,"profile":"balanced"}
]'
env XDG_DATA_HOME="$tmp/data" XDG_CONFIG_HOME="$tmp/config" XDG_CACHE_HOME="$tmp/cache" \
    XDG_RUNTIME_DIR="$tmp/runtime" GSETTINGS_BACKEND=keyfile \
    dbus-run-session -- timeout 40 gnome-shell --headless --virtual-monitor "$mode" \
    --wayland --no-x11 >"$tmp/shell.log" 2>&1 || true

if ! ls "$tmp/shots/"*.png >/dev/null 2>&1; then
    echo "no screenshots; shell log:" >&2
    grep -iE 'error|battery-pill|shot-helper' "$tmp/shell.log" | tail -30 >&2
    exit 1
fi
grep -iE 'battery-pill|shot-helper' "$tmp/shell.log" | grep -v '^$' | tail -10 || true
python3 - "$out" "$tmp"/shots/*.png <<'PY'
import sys
from PIL import Image
ims = [Image.open(p) for p in sys.argv[2:]]
w = max(i.width for i in ims); h = sum(i.height for i in ims)
sheet = Image.new('RGBA', (w, h))
y = 0
for i in ims:
    sheet.paste(i, (0, y)); y += i.height
sheet.save(sys.argv[1]); print(sys.argv[1], sheet.size)
PY
