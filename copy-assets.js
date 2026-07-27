// copy-assets.js
// Run after tailwind build — copies all src files + built CSS into dist/
const fs   = require("fs");
const path = require("path");

const SRC  = path.join(__dirname, "src");
const DIST = path.join(__dirname, "dist");

// Ensure dist exists
if (!fs.existsSync(DIST)) fs.mkdirSync(DIST, { recursive: true });

// 1. Copy everything from src/ into dist/
function copyDir(src, dest) {
  fs.readdirSync(src).forEach(file => {
    const srcPath  = path.join(src, file);
    const destPath = path.join(dest, file);
    if (fs.statSync(srcPath).isDirectory()) {
      if (!fs.existsSync(destPath)) fs.mkdirSync(destPath);
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  });
}
copyDir(SRC, DIST);

// 2. tailwind.output.css, style.css, and mobile.css all live in src/ now,
//    so copyDir() above already carries them into dist/ — nothing extra needed.

console.log("✅ Build complete — dist/ is ready for firebase deploy");
