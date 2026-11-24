#!/usr/bin/env bash
# Battery Pill: one-command installer for GNOME Shell 49–51 (user level, no sudo).
#
#   curl -fsSL https://raw.githubusercontent.com/ensignalp/battery-pill/main/install.sh | bash
#   curl -fsSL .../install.sh | bash -s -- --sf-pro      # also fetch SF Pro Text from Apple
#   curl -fsSL .../install.sh | bash -s -- --uninstall
#
# From a clone: ./install.sh [--sf-pro | --uninstall]
set -euo pipefail

main() {
    local uuid=battery-pill@ensignalp
    local repo=ensignalp/battery-pill
    local branch=main
    local dest="${XDG_DATA_HOME:-$HOME/.local/share}/gnome-shell/extensions/$uuid"
    local sf_pro=0 uninstall=0

    for arg in "$@"; do
        case "$arg" in
            --sf-pro) sf_pro=1 ;;
            --uninstall) uninstall=1 ;;
            -h|--help) sed -n '2,8p' "${BASH_SOURCE[0]:-/dev/null}" 2>/dev/null || true; return 0 ;;
            *) echo "unknown option: $arg" >&2; return 2 ;;
        esac
    done

    say() { printf '\033[1;32m==>\033[0m %s\n' "$*"; }
    warn() { printf '\033[1;33m!!\033[0m %s\n' "$*" >&2; }

    if (( uninstall )); then
        gnome-extensions disable "$uuid" 2>/dev/null || true
        rm -rf "$dest"
        say "Battery Pill removed. The built-in battery icon is back after the next login."
        return 0
    fi

    command -v glib-compile-schemas >/dev/null || { warn "glib-compile-schemas not found (install glib2)"; return 1; }

    # global (not local): the EXIT trap runs after main() returns
    BP_TMP="$(mktemp -d)"
    trap 'rm -rf "$BP_TMP"' EXIT
    local tmp="$BP_TMP"

    # Use the local checkout when run from a clone, otherwise download the source.
    local src
    local here
    here="$(cd "$(dirname "${BASH_SOURCE[0]:-.}")" 2>/dev/null && pwd || true)"
    if [[ -n "$here" && -f "$here/metadata.json" && -f "$here/extension.js" ]]; then
        src="$here"
    else
        say "Downloading Battery Pill…"
        curl -fsSL "https://codeload.github.com/$repo/tar.gz/refs/heads/$branch" | tar -xz -C "$tmp"
        src="$(find "$tmp" -maxdepth 1 -mindepth 1 -type d | head -1)"
    fi

    local shell_major
    shell_major="$(gnome-shell --version 2>/dev/null | grep -oE '[0-9]+' | head -1 || true)"
    if [[ -n "$shell_major" ]] && ! grep -q "\"$shell_major\"" "$src/metadata.json"; then
        warn "GNOME Shell $shell_major is not in the tested list (49–51); installing anyway."
    fi

    say "Installing to $dest"
    rm -rf "$dest"
    mkdir -p "$dest"
    cp -r "$src"/{metadata.json,extension.js,prefs.js,stylesheet.css,lib,schemas} "$dest/"
    rm -f "$dest/schemas/gschemas.compiled"
    glib-compile-schemas "$dest/schemas"

    (( sf_pro )) && install_sf_pro "$tmp"

    # On Wayland a new extension is only picked up after re-login, so also
    # record it in enabled-extensions; `gnome-extensions enable` works when it can.
    if ! gnome-extensions enable "$uuid" 2>/dev/null; then
        local cur
        cur="$(gsettings get org.gnome.shell enabled-extensions 2>/dev/null || echo '@as []')"
        if [[ "$cur" != *"'$uuid'"* ]]; then
            local new
            new="$(python3 -c 'import ast,sys; v=sys.argv[1].replace("@as ",""); l=ast.literal_eval(v); l.append(sys.argv[2]); print(l)' "$cur" "$uuid")"
            gsettings set org.gnome.shell enabled-extensions "$new"
        fi
    fi

    say "Done. Log out and back in to load Battery Pill (Wayland cannot reload extensions live)."
    say "Settings: gnome-extensions prefs $uuid"
    if [[ -z "$(fc-list 'SF Pro Text' family 2>/dev/null)" ]]; then
        echo "    Tip: the default font is SF Pro Text Bold. Without it the system font is used."
        echo "    Re-run with --sf-pro to fetch it from Apple (Apple's font license applies)."
    fi
}

install_sf_pro() {
    local tmp="$1"
    local fonts="${XDG_DATA_HOME:-$HOME/.local/share}/fonts/SF-Pro-Text"
    local sevenzip
    sevenzip="$(command -v 7zz || command -v 7z || command -v 7za || true)"
    if [[ -z "$sevenzip" ]] || ! command -v cpio >/dev/null; then
        printf '\033[1;33m!!\033[0m %s\n' "SF Pro needs 7-Zip and cpio (Fedora: sudo dnf install 7zip cpio). Skipping." >&2
        return 0
    fi
    printf '\033[1;32m==>\033[0m %s\n' "Downloading SF Pro from Apple (~210 MB). By installing it you accept Apple's font license."
    curl -fL --progress-bar -o "$tmp/SF-Pro.dmg" https://devimages-cdn.apple.com/design/resources/download/SF-Pro.dmg
    mkdir -p "$tmp/dmg" "$tmp/pkg" "$tmp/payload"
    "$sevenzip" x -y -o"$tmp/dmg" "$tmp/SF-Pro.dmg" >/dev/null
    "$sevenzip" x -y -o"$tmp/pkg" "$(find "$tmp/dmg" -name '*.pkg' | head -1)" >/dev/null
    (cd "$tmp/payload" && "$sevenzip" x -so "$(find "$tmp/pkg" -name Payload | head -1)" | cpio -idm --quiet)
    mkdir -p "$fonts"
    find "$tmp/payload" -name 'SF-Pro-Text-*.otf' -exec install -m644 {} "$fonts/" \;
    fc-cache -f "$fonts" >/dev/null
    printf '\033[1;32m==>\033[0m %s\n' "SF Pro Text installed to $fonts"
}

main "$@"
