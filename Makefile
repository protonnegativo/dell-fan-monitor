UUID      = dell-fan-monitor@protonnegativo.github.io
ZIP       = $(UUID).shell-extension.zip
HELPER    = /usr/local/sbin/dell-fan-monitor-helper
POLICY    = /usr/share/polkit-1/actions/io.github.protonnegativo.dellfanmonitor.policy
STATE     = /run/dell-fan-monitor
SAVED     = /var/lib/dell-fan-monitor
UNIT      = /etc/systemd/system/dell-fan-monitor-restore.service

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
	install -o root -g root -m 644 helper/dell-fan-monitor-restore.service $(UNIT)
	systemctl daemon-reload
	systemctl enable dell-fan-monitor-restore.service

uninstall-helper:
	-systemctl disable dell-fan-monitor-restore.service
	-[ -x $(HELPER) ] && $(HELPER) fan auto
	rm -f $(HELPER) $(POLICY) $(STATE) $(UNIT)
	rm -rf $(SAVED)
	systemctl daemon-reload

clean:
	rm -f $(ZIP)
