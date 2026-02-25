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

const PUBLIC = path.join(ROOT, 'public');

for (const file of FRONTEND_FILES) {
    const src = path.join(PUBLIC, file);
    if (fs.existsSync(src)) {
        fs.copyFileSync(src, path.join(WWW, file));
    } else {
        console.warn(`Warning: ${file} not found in public/`);
    }
}

for (const dir of FRONTEND_DIRS) {
    const src = path.join(PUBLIC, dir);
    if (fs.existsSync(src)) {
        copyDir(src, path.join(WWW, dir));
    } else {
        console.warn(`Warning: ${dir}/ not found in public/`);
    }
}

const API_BASE = process.env.WORDETH_API_URL || 'https://www.wordeth.com';
const configPath = path.join(WWW, 'js', 'config.js');
if (!fs.existsSync(configPath)) {
    console.error(`config.js not found at ${configPath}. Did the build copy js/ correctly?`);
    process.exit(1);
}
const configContent = fs.readFileSync(configPath, 'utf8');
const newContent = configContent.replace(
    "window.WORDETH_API_BASE || ''",
    `window.WORDETH_API_BASE || '${API_BASE}'`
);
if (newContent === configContent) {
    console.error('WARNING: API URL replacement did not match. Check js/config.js format.');
    console.error('   Mobile app will use empty base URL — API calls will fail.');
    process.exit(1);
}
fs.writeFileSync(configPath, newContent);

console.log(`Frontend built to www/`);
console.log(`API base URL set to: ${API_BASE}`);
console.log('Run "npx cap sync" to push changes to native projects.');
