#!/bin/bash
# WidgetThemes installer.
#
# This script downloads WidgetThemes 1.3, checks it against the checksum below,
# moves it into your Applications folder and opens it. That's all it does: it doesn't
# need your password, change any settings, or install anything else.
#
#   curl -fsSL https://disturbedprophet.github.io/widgetthemes/install.sh | bash
#
# To uninstall, quit WidgetThemes from its menu bar icon and move it to the Trash.
set -euo pipefail

VERSION="1.3"
URL="https://disturbedprophet.github.io/widgetthemes/downloads/WidgetThemes-1.3.zip"
SHA256="4a2bc6442aa95f9cf9dce1ef651121e057dd7d005d5b55a799b1bfd3a2498628"

fail() { printf '\n\033[31mError:\033[0m %s\n' "$1" >&2; exit 1; }

[ "$(uname -s)" = "Darwin" ] || fail "WidgetThemes is a Mac app."
MAJOR=$(sw_vers -productVersion | cut -d. -f1)
[ "$MAJOR" -ge 14 ] || fail "WidgetThemes needs macOS 14 Sonoma or later (this Mac has $(sw_vers -productVersion))."

WORK=$(mktemp -d)
trap '/bin/rm -rf "$WORK"' EXIT

printf 'Downloading WidgetThemes %s…\n' "$VERSION"
curl -fL --progress-bar "$URL" -o "$WORK/WidgetThemes.zip" || fail "Couldn't download $URL"

printf 'Checking the download… '
ACTUAL=$(shasum -a 256 "$WORK/WidgetThemes.zip" | awk '{print $1}')
[ "$ACTUAL" = "$SHA256" ] || fail "The download doesn't match its checksum, so it wasn't installed. Please try again."
echo "OK"

/usr/bin/ditto -x -k "$WORK/WidgetThemes.zip" "$WORK/unpacked"
[ -d "$WORK/unpacked/WidgetThemes.app" ] || fail "The download didn't contain WidgetThemes.app."

# /Applications if this account can write to it (admins can), otherwise ~/Applications.
DEST="/Applications"
if [ ! -w "$DEST" ]; then
    DEST="$HOME/Applications"
    mkdir -p "$DEST"
fi

if pgrep -xq WidgetThemes; then
    echo "Quitting the running copy…"
    osascript -e 'quit app "WidgetThemes"' >/dev/null 2>&1 || true
    sleep 1
    pkill -x WidgetThemes >/dev/null 2>&1 || true
fi

/bin/rm -rf "$DEST/WidgetThemes.app"
/usr/bin/ditto "$WORK/unpacked/WidgetThemes.app" "$DEST/WidgetThemes.app"
echo "Installed in $DEST."

open "$DEST/WidgetThemes.app"
echo "WidgetThemes is open. Look for its icon in your menu bar."
