#!/bin/bash

# Post-removal script for YourPrinter
# This script runs after the package is removed

# Remove desktop entries (both old and new)
if [ -f /usr/share/applications/yourprinter-ts.desktop ]; then
    rm -f /usr/share/applications/yourprinter-ts.desktop || true
fi
if [ -f /usr/share/applications/YourPrinter.desktop ]; then
    rm -f /usr/share/applications/YourPrinter.desktop || true
fi

# Update desktop database
if command -v update-desktop-database >/dev/null 2>&1; then
    update-desktop-database /usr/share/applications || true
fi

# Remove symlinks from /usr/local/bin (both old and new)
if [ -L /usr/local/bin/yourprinter-ts ]; then
    rm -f /usr/local/bin/yourprinter-ts || true
fi
if [ -L /usr/local/bin/YourPrinter ]; then
    rm -f /usr/local/bin/YourPrinter || true
fi

# Remove any leftover configuration files (optional)
# Note: We typically don't remove user data/config files in afterRemove
# but you can uncomment the lines below if needed
# rm -rf /home/*/.config/YourPrinter || true
# rm -rf /root/.config/YourPrinter || true

exit 0
 