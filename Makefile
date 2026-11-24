UUID      = dell-fan-monitor@protonnegativo.github.io
ZIP       = $(UUID).shell-extension.zip
HELPER    = /usr/local/sbin/dell-fan-monitor-helper
POLICY    = /usr/share/polkit-1/actions/io.github.protonnegativo.dellfanmonitor.policy
STATE     = /run/dell-fan-monitor

# Translations are built only when gettext (msgfmt) is installed.
PODIR := $(shell command -v msgfmt >/dev/null 2>&1 && echo --podir=../po)

.PHONY: pack install uninstall install-helper uninstall-helper clean

pack:
	gnome-extensions pack --force $(PODIR) --out-dir=. extension

install: pack
	gnome-extensions install --force $(ZIP)
	@echo "Log out and back in, then run: gnome-extensions enable $(UUID)"

uninstall:
	gnome-extensions uninstall $(UUID)

install-helper:
	install -o root -g root -m 755 helper/dell-fan-monitor-helper $(HELPER)
	install -o root -g root -m 644 helper/io.github.protonnegativo.dellfanmonitor.policy $(POLICY)

uninstall-helper:
	-[ -x $(HELPER) ] && $(HELPER) fan auto
	rm -f $(HELPER) $(POLICY) $(STATE)

clean:
	rm -f $(ZIP)
