UUID := battery-pill@ensignalp
DEST := $(HOME)/.local/share/gnome-shell/extensions/$(UUID)
SCHEMA := schemas/org.gnome.shell.extensions.battery-pill.gschema.xml

.PHONY: schemas test preview shot link pack install nested logs mock-on mock-off

schemas:
	glib-compile-schemas schemas/

test:
	gjs -m tests/stateResolver.test.js
	gjs -m tests/geometry.test.js

preview:
	gjs -m tools/render-preview.js /tmp/bp-preview.png

# Real GNOME Shell screenshot (headless, isolated from the running session)
shot: schemas
	tools/shell-shot.sh /tmp/bp-shell.png 1

# Development: symlink the working tree (log out/in once on Wayland afterwards).
link: schemas
	ln -sfn "$(CURDIR)" "$(DEST)"

pack: schemas
	gnome-extensions pack --force --extra-source=lib --extra-source=LICENSE --schema=$(SCHEMA)

install: pack
	gnome-extensions install --force $(UUID).shell-extension.zip

# Needs: sudo dnf install mutter-devkit
nested:
	dbus-run-session -- gnome-shell --devkit

logs:
	journalctl -f -o cat /usr/bin/gnome-shell

GS := gsettings --schemadir "$(CURDIR)/schemas"
mock-on:
	$(GS) set org.gnome.shell.extensions.battery-pill mock-file "$(HOME)/.cache/bp-mock.json"
mock-off:
	$(GS) reset org.gnome.shell.extensions.battery-pill mock-file
