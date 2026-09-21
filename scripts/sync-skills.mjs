import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const rootSkill = path.resolve('skill');
const canonicalSkillMd = fs.readFileSync(path.join(rootSkill, 'SKILL.md'), 'utf-8');

const targets = [
  { dir: path.resolve('skills/browserclaw'), name: 'browserclaw' },
  { dir: 'D:/workspace/browserclaw/skill', name: 'browserclaw' },
  { dir: path.resolve('plugins/browserclaw/skills/browserclaw'), name: 'browserclaw' },
  { dir: 'D:/workspace/browserclaw/plugins/browserclaw/skills/browserclaw', name: 'browserclaw' },
  { dir: 'C:/Users/Lenovo/.gemini/config/skills/browserclaw', name: 'browserclaw', managed: true },
  { dir: 'C:/Users/Lenovo/.gemini/config/skills/mcp-chrome', name: 'mcp-chrome', managed: true },
];

function copyDir(src, dest, isPlugin = false) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath, isPlugin);
    } else {
      if (isPlugin && (entry.name.endsWith('.md') || entry.name.endsWith('.json'))) {
        let text = fs.readFileSync(srcPath, 'utf-8');
        text = text
          .replace(/\bchrome_/g, 'browserclaw_')
          .replace(/\bget_windows_and_tabs\b/g, 'browserclaw_get_windows_and_tabs');
        fs.writeFileSync(destPath, text, 'utf-8');
      } else {
        fs.copyFileSync(srcPath, destPath);
      }
    }
  }
}

for (const target of targets) {
  try {
    // Skip remote/external targets if parent directory doesn't exist
    if (path.isAbsolute(target.dir) && !target.dir.startsWith(path.resolve('.'))) {
      const parentDir = path.dirname(target.dir);
      if (!fs.existsSync(parentDir)) {
        continue;
      }
    }
    const isPlugin = target.dir.includes('plugins');
    copyDir(rootSkill, target.dir, isPlugin);
    let content = canonicalSkillMd;
    if (target.name === 'mcp-chrome') {
      content = content.replace(/^name:\s*browserclaw/m, 'name: mcp-chrome');
    }
    if (isPlugin) {
      content = content
        .replace(/\bchrome_/g, 'browserclaw_')
        .replace(/\bget_windows_and_tabs\b/g, 'browserclaw_get_windows_and_tabs');
    }
    const destSkillMd = path.join(target.dir, 'SKILL.md');
    fs.writeFileSync(destSkillMd, content, 'utf-8');

    if (target.managed) {
      const hash = crypto.createHash('sha256').update(content).digest('hex');
      const managedFile = path.join(target.dir, '.browserclaw-managed.json');
      const managedData = {
        contentHash: hash,
        updatedAt: new Date().toISOString(),
        lastSync: new Date().toISOString(),
      };
      fs.writeFileSync(managedFile, JSON.stringify(managedData, null, 2) + '\n', 'utf-8');
    }
  } catch (err) {
    console.warn(`Skipped sync to ${target.dir}: ${err.message}`);
  }
}
console.log('Skill synchronization completed successfully across all targets.');
