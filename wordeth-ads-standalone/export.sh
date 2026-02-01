#!/bin/bash

# Knew-Cleus Ads SDK Export Script
# This script exports the standalone ads package to a target directory

echo "🚀 Knew-Cleus Ads SDK Export Script"
echo "=================================="

# Check if target directory is provided
if [ -z "$1" ]; then
    echo "Usage: ./export.sh <target-directory>"
    echo "Example: ./export.sh ../my-website/js/"
    exit 1
fi

TARGET_DIR="$1"

# Create target directory if it doesn't exist
mkdir -p "$TARGET_DIR"

# Copy the main SDK file
echo "📋 Copying knew-cleus-ads.min.js to $TARGET_DIR..."
cp dist/knew-cleus-ads.min.js "$TARGET_DIR/"

# Copy documentation
echo "📋 Copying documentation..."
cp dist/README.md "$TARGET_DIR/"
cp dist/LICENSE "$TARGET_DIR/"

# Copy demo file
echo "📋 Copying demo.html..."
cp dist/demo.html "$TARGET_DIR/"

echo ""
echo "✅ Export completed successfully!"
echo ""
echo "📁 Files exported to: $TARGET_DIR"
echo "  - knew-cleus-ads.min.js (Main SDK file)"
echo "  - README.md (Documentation)"
echo "  - LICENSE (MIT License)"
echo "  - demo.html (Demo page)"
echo ""
echo "🚀 To use in your project:"
echo "1. Include the script in your HTML:"
echo "   <script src=\"knew-cleus-ads.min.js\"></script>"
echo ""
echo "2. Initialize the SDK:"
echo "   <script>"
echo "     const knewCleusAds = new KnewCleusAds({"
echo "       siteId: 'your-site-id',"
echo "       apiUrl: 'https://api.knew-cleus.com/ads'"
echo "     });"
echo "     knewCleusAds.init();"
echo "   </script>"
echo ""
echo "📖 See README.md for full documentation"
