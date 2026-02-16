const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const WWW = path.join(ROOT, 'www');

const FRONTEND_FILES = [
    'index.html', 'verses.html', 'lyrics.html', 'merch.html',
    'articles.html', 'signin.html', 'signup.html', 'profile.html',
    'w-admin.html', 'admin-ads.html', 'admin-usage.html',
    'ad-admin.html', 'ad-register.html', 'privacy.html',
    'privacy-admin.html', 'terms.html', '404.html'
];

const FRONTEND_DIRS = ['js', 'css', 'assets', 'images'];

function cleanDir(dir) {
    if (fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true, force: true });
    }
    fs.mkdirSync(dir, { recursive: true });
}

function copyDir(src, dest) {
    if (!fs.existsSync(src)) return;
    fs.mkdirSync(dest, { recursive: true });
    const entries = fs.readdirSync(src, { withFileTypes: true });
    for (const entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);
        if (entry.isDirectory()) {
            copyDir(srcPath, destPath);
        } else {
            fs.copyFileSync(srcPath, destPath);
        }
    }
}

console.log('Building mobile frontend into www/ ...');
cleanDir(WWW);

for (const file of FRONTEND_FILES) {
    const src = path.join(ROOT, file);
    if (fs.existsSync(src)) {
        fs.copyFileSync(src, path.join(WWW, file));
    }
}

for (const dir of FRONTEND_DIRS) {
    copyDir(path.join(ROOT, dir), path.join(WWW, dir));
}

const API_BASE = process.env.WORDETH_API_URL || 'https://your-backend-url.com';
const configPath = path.join(WWW, 'js', 'config.js');
let configContent = fs.readFileSync(configPath, 'utf8');
configContent = configContent.replace(
    "window.WORDETH_API_BASE || ''",
    `window.WORDETH_API_BASE || '${API_BASE}'`
);
fs.writeFileSync(configPath, configContent);

console.log(`Frontend built to www/`);
console.log(`API base URL set to: ${API_BASE}`);
console.log('Run "npx cap sync" to push changes to native projects.');
