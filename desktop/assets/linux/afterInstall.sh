#!/bin/bash

# Post-installation script for YourPrinter
# This script runs after the package is installed

# Set proper permissions for the application
chmod +x /opt/YourPrinter/YourPrinter || true

# Create desktop entry if it doesn't exist
if [ ! -f /usr/share/applications/YourPrinter.desktop ]; then
    cat > /usr/share/applications/YourPrinter.desktop << EOF
[Desktop Entry]
Name=YourPrinter
Comment=Monitoring and Control software for FlashForge printers
Exec=/opt/YourPrinter/YourPrinter
Icon=YourPrinter
Type=Application
Categories=Utility;
StartupNotify=true
EOF
fi

# Update desktop database
if command -v update-desktop-database >/dev/null 2>&1; then
    update-desktop-database /usr/share/applications || true
fi

# Create symlink in /usr/local/bin for CLI access (optional)
if [ ! -f /usr/local/bin/YourPrinter ]; then
    ln -sf /opt/YourPrinter/YourPrinter /usr/local/bin/YourPrinter || true
fi

# Clean up old yourprinter-ts entries from previous installations
if [ -f /usr/share/applications/yourprinter-ts.desktop ]; then
    rm -f /usr/share/applications/yourprinter-ts.desktop || true
fi
if [ -L /usr/local/bin/yourprinter-ts ]; then
    rm -f /usr/local/bin/yourprinter-ts || true
fi

exit 0
 