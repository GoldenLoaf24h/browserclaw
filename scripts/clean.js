import fs from 'node:fs';
import path from 'node:path';

const mode = process.argv[2] || 'dist';
const root = process.cwd();

const distTargets = new Set(['dist', '.turbo', '.output']);

function removeDirs(dir, targets) {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (targets.has(entry.name)) {
        try {
          fs.rmSync(fullPath, { recursive: true, force: true });
          console.log(`Removed ${fullPath}`);
        } catch (err) {
          console.error(`Failed to remove ${fullPath}:`, err);
        }
      } else if (entry.name !== 'node_modules' && !entry.name.startsWith('.')) {
        removeDirs(fullPath, targets);
      }
    }
  }
}

if (mode === 'dist') {
  removeDirs(root, distTargets);
} else if (mode === 'modules') {
  removeDirs(root, new Set(['node_modules']));
} else if (mode === 'all') {
  removeDirs(root, new Set(['dist', '.turbo', '.output', 'node_modules']));
}
