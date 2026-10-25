#!/bin/bash
# DeskWidgets installer.
#
# This script downloads DeskWidgets 1.3, checks it against the checksum below,
# moves it into your Applications folder and opens it. That's all it does: it doesn't
# need your password, change any settings, or install anything else.
#
#   curl -fsSL https://disturbedprophet.github.io/deskwidgets/install.sh | bash
#
# To uninstall, quit DeskWidgets from its menu bar icon and move it to the Trash.
set -euo pipefail

VERSION="1.3"
URL="https://disturbedprophet.github.io/deskwidgets/downloads/DeskWidgets-1.3.zip"
SHA256="8ec18228a86e7d2500dcbce92a9a5463692f7b614b37ab365491c0cdd0b4ad14"

fail() { printf '\n\033[31mError:\033[0m %s\n' "$1" >&2; exit 1; }

[ "$(uname -s)" = "Darwin" ] || fail "DeskWidgets is a Mac app."
MAJOR=$(sw_vers -productVersion | cut -d. -f1)
[ "$MAJOR" -ge 14 ] || fail "DeskWidgets needs macOS 14 Sonoma or later (this Mac has $(sw_vers -productVersion))."

WORK=$(mktemp -d)
trap '/bin/rm -rf "$WORK"' EXIT

printf 'Downloading DeskWidgets %s…\n' "$VERSION"
curl -fL --progress-bar "$URL" -o "$WORK/DeskWidgets.zip" || fail "Couldn't download $URL"

printf 'Checking the download… '
ACTUAL=$(shasum -a 256 "$WORK/DeskWidgets.zip" | awk '{print $1}')
[ "$ACTUAL" = "$SHA256" ] || fail "The download doesn't match its checksum, so it wasn't installed. Please try again."
echo "OK"

/usr/bin/ditto -x -k "$WORK/DeskWidgets.zip" "$WORK/unpacked"
[ -d "$WORK/unpacked/DeskWidgets.app" ] || fail "The download didn't contain DeskWidgets.app."

# /Applications if this account can write to it (admins can), otherwise ~/Applications.
DEST="/Applications"
if [ ! -w "$DEST" ]; then
    DEST="$HOME/Applications"
    mkdir -p "$DEST"
fi

if pgrep -xq DeskWidgets; then
    echo "Quitting the running copy…"
    osascript -e 'quit app "DeskWidgets"' >/dev/null 2>&1 || true
    sleep 1
    pkill -x DeskWidgets >/dev/null 2>&1 || true
fi

/bin/rm -rf "$DEST/DeskWidgets.app"
/usr/bin/ditto "$WORK/unpacked/DeskWidgets.app" "$DEST/DeskWidgets.app"
echo "Installed in $DEST."

open "$DEST/DeskWidgets.app"
echo "DeskWidgets is open. Look for its icon in your menu bar."
