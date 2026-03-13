const fs = require('fs');
const path = require('path');

const iconsDir = path.join(__dirname, '..', 'icons');
if (!fs.existsSync(iconsDir)) fs.mkdirSync(iconsDir, { recursive: true });

// Minimal 16x16 PNG (single pixel scaled by browser if needed)
const pngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAHElEQVQ4T2NkYGD4z0ABYBwN0rFhDA0MowEAAAQQAAF0b0g4AAAAAElFTkSuQmCC';
const buf = Buffer.from(pngBase64, 'base64');

['icon16.png', 'icon48.png', 'icon128.png'].forEach((name) => {
  fs.writeFileSync(path.join(iconsDir, name), buf);
});
console.log('Icons created in', iconsDir);
