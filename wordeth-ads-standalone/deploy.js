#!/usr/bin/env node

/**
 * Wordeth Ads SDK Deployment Script
 * Builds and packages the standalone ads system
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🚀 Building Wordeth Ads SDK...\n');

// Create dist directory if it doesn't exist
const distDir = path.join(__dirname, 'dist');
if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir, { recursive: true });
}

try {
    // Install dependencies if needed
    if (!fs.existsSync(path.join(__dirname, 'node_modules'))) {
        console.log('📦 Installing dependencies...');
        execSync('npm install', { stdio: 'inherit' });
    }
    
    // Build the SDK
    console.log('🔨 Building SDK...');
    execSync('npm run build', { stdio: 'inherit' });
    
    // Copy additional files
    console.log('📋 Copying additional files...');
    
    // Copy README
    const readmeContent = `# Knew-Cleus Ads SDK

A lightweight, standalone advertising system that can be embedded on any website.

## Quick Start

\`\`\`html
<script src="knew-cleus-ads.min.js"></script>
<script>
    const knewCleusAds = new KnewCleusAds({
        siteId: 'your-site-id',
        apiUrl: 'https://api.knew-cleus.com/ads'
    });
    knewCleusAds.init();
</script>
\`\`\`

## Documentation

Visit https://knew-cleus.com/ads/docs for full documentation.

## License

MIT License - see LICENSE file for details.
`;
    
    fs.writeFileSync(path.join(distDir, 'README.md'), readmeContent);
    
    // Copy license
    const licenseContent = `MIT License

Copyright (c) 2024 Knew-Cleus

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
`;
    
    fs.writeFileSync(path.join(distDir, 'LICENSE'), licenseContent);
    
    // Create demo HTML
    const demoHtml = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Knew-Cleus Ads SDK Demo</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
            line-height: 1.6;
        }
        .demo-section {
            margin: 40px 0;
            padding: 20px;
            border: 1px solid #ddd;
            border-radius: 8px;
        }
        .code {
            background: #f4f4f4;
            padding: 15px;
            border-radius: 5px;
            font-family: monospace;
            overflow-x: auto;
        }
    </style>
</head>
<body>
    <h1>🚀 Knew-Cleus Ads SDK Demo</h1>
    
    <div class="demo-section">
        <h2>Integration Code</h2>
        <div class="code">
&lt;script src="knew-cleus-ads.min.js"&gt;&lt;/script&gt;
&lt;script&gt;
    const knewCleusAds = new KnewCleusAds({
        siteId: 'demo-site',
        apiUrl: 'https://api.knew-cleus.com/ads'
    });
    knewCleusAds.init();
&lt;/script&gt;
        </div>
    </div>
    
    <div class="demo-section">
        <h2>Ad Slots</h2>
        <p>Ads will appear automatically in the slots below:</p>
        <div id="ad-slots"></div>
    </div>
    
    <div class="demo-section">
        <h2>Statistics</h2>
        <p>Impressions: <span id="impressions">0</span></p>
        <p>Clicks: <span id="clicks">0</span></p>
        <p>CTR: <span id="ctr">0%</span></p>
    </div>
    
    <script src="knew-cleus-ads.min.js"></script>
    <script>
        const knewCleusAds = new KnewCleusAds({
            siteId: 'demo-site',
            apiUrl: 'https://api.knew-cleus.com/ads',
            debug: true
        });
        
        knewCleusAds.init();
        
        // Update stats every 5 seconds
        setInterval(() => {
            const stats = knewCleusAds.getStats();
            document.getElementById('impressions').textContent = stats.impressions;
            document.getElementById('clicks').textContent = stats.clicks;
            document.getElementById('ctr').textContent = 
                stats.impressions > 0 ? ((stats.clicks / stats.impressions) * 100).toFixed(1) + '%' : '0%';
        }, 5000);
    </script>
</body>
</html>`;
    
    fs.writeFileSync(path.join(distDir, 'demo.html'), demoHtml);
    
    // Create package info
    const packageInfo = {
        name: 'knew-cleus-ads',
        version: '1.0.0',
        description: 'Standalone contextual advertising system',
        main: 'knew-cleus-ads.min.js',
        files: ['knew-cleus-ads.min.js', 'knew-cleus-ads.js', 'README.md', 'LICENSE', 'demo.html'],
        homepage: 'https://knew-cleus.com/ads',
        license: 'MIT'
    };
    
    fs.writeFileSync(path.join(distDir, 'package.json'), JSON.stringify(packageInfo, null, 2));
    
    console.log('\n✅ Build completed successfully!');
    console.log('\n📁 Files created in dist/ directory:');
    console.log('  - knew-cleus-ads.min.js (Production build)');
    console.log('  - knew-cleus-ads.js (Development build)');
    console.log('  - README.md (Documentation)');
    console.log('  - LICENSE (MIT License)');
    console.log('  - demo.html (Demo page)');
    console.log('  - package.json (Package info)');
    
    console.log('\n🚀 Ready for deployment!');
    console.log('\nTo use on any website:');
    console.log('1. Copy knew-cleus-ads.min.js to your website');
    console.log('2. Add the integration code to your HTML');
    console.log('3. Configure your siteId and apiUrl');
    
} catch (error) {
    console.error('❌ Build failed:', error.message);
    process.exit(1);
}
