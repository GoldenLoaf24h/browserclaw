const fs = require('fs');
const path = require('path');

const target = path.resolve(__dirname, '../../dist/scripts/postinstall.js');
if (fs.existsSync(target)) {
  try {
    require(target);
  } catch (err) {
    // Silently ignore postinstall register failure in development/CI
  }
}
