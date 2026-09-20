const fs = require('fs');
const path = require('path');

const target = fs.existsSync(path.resolve(__dirname, 'postinstall.js'))
  ? path.resolve(__dirname, 'postinstall.js')
  : path.resolve(__dirname, '../../dist/scripts/postinstall.js');

if (fs.existsSync(target)) {
  try {
    const mod = require(target);
    if (typeof mod.main === 'function') {
      mod.main().catch(() => {});
    }
  } catch (err) {
    // Silently ignore postinstall register failure in development/CI
  }
}
