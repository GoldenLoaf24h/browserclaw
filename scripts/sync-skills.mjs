import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const rootSkill = path.resolve('skill');
const canonicalSkillMd = fs.readFileSync(path.join(rootSkill, 'SKILL.md'), 'utf-8');

const targets = [
  { dir: path.resolve('skills/browserclaw'), name: 'browserclaw' },
  { dir: path.resolve('plugins/browserclaw/skills/browserclaw'), name: 'browserclaw', isPlugin: true },
  { dir: 'D:/workspace/browserclaw/skill', name: 'browserclaw' },
  { dir: 'D:/workspace/browserclaw/plugins/browserclaw/skills/browserclaw', name: 'browserclaw', isPlugin: true },
  { dir: 'C:/Users/Lenovo/.codex/skills/browserclaw', name: 'browserclaw' },
  { dir: 'C:/Users/Lenovo/.codex/plugins/cache/browserclaw/browserclaw/3.1.0/skills/browserclaw', name: 'browserclaw', isPlugin: true },
  { dir: 'C:/Users/Lenovo/.codex/.tmp/marketplaces/browserclaw/skill', name: 'browserclaw' },
  { dir: 'C:/Users/Lenovo/.agents/skills/browserclaw', name: 'browserclaw' },
  { dir: 'C:/Users/Lenovo/.claude/skills/browserclaw', name: 'browserclaw' },
  { dir: 'C:/Users/Lenovo/.gemini/skills/browserclaw', name: 'browserclaw' },
  { dir: 'C:/Users/Lenovo/.gemini/config/skills/browserclaw', name: 'browserclaw', managed: true },
  { dir: 'C:/Users/Lenovo/.gemini/config/skills/mcp-chrome', name: 'mcp-chrome', managed: true },
  { dir: 'C:/Users/Lenovo/.gemini/antigravity-cli/skills/browserclaw', name: 'browserclaw' },
  { dir: 'C:/Users/Lenovo/.config/opencode/skills/browserclaw', name: 'browserclaw' },
  { dir: 'C:/Users/Lenovo/AppData/Local/hermes/plugins/browserclaw/skills/browserclaw', name: 'browserclaw', isPlugin: true },
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
          .replaceAll('chrome_', 'browserclaw_')
          .replaceAll('get_windows_and_tabs', 'browserclaw_get_windows_and_tabs');
        fs.writeFileSync(destPath, text, 'utf-8');
      } else {
        fs.copyFileSync(srcPath, destPath);
      }
    }
  }
}

for (const target of targets) {
  try {
    if (path.isAbsolute(target.dir) && !target.dir.startsWith(path.resolve('.'))) {
      const parentDir = path.dirname(target.dir);
      if (!fs.existsSync(parentDir)) {
        continue;
      }
    }
    const isPlugin = Boolean(target.isPlugin || target.dir.includes('plugins'));
    copyDir(rootSkill, target.dir, isPlugin);
    let content = canonicalSkillMd;
    if (target.name === 'mcp-chrome') {
      content = content.replace(/^name:\s*browserclaw/m, 'name: mcp-chrome');
    }
    if (isPlugin) {
      content = content
        .replaceAll('chrome_', 'browserclaw_')
        .replaceAll('get_windows_and_tabs', 'browserclaw_get_windows_and_tabs');
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
      fs.writeFileSync(managedFile, JSON.stringify(managedData, null, 2) + String.fromCharCode(10), 'utf-8');
    }
  } catch (err) {
    console.warn('Skipped sync to ' + target.dir + ': ' + err.message);
  }
}

// Additionally sync plugin definition files to Hermes plugin directory
const hermesPluginDir = 'C:/Users/Lenovo/AppData/Local/hermes/plugins/browserclaw';
if (fs.existsSync(hermesPluginDir)) {
  const pluginSrc = path.resolve('plugins/browserclaw');
  const syncFiles = ['plugin.yaml', '__init__.py', 'core_schemas.json', '.codex-plugin/plugin.json'];
  for (const rel of syncFiles) {
    const src = path.join(pluginSrc, rel);
    const dst = path.join(hermesPluginDir, rel);
    if (fs.existsSync(src)) {
      fs.mkdirSync(path.dirname(dst), { recursive: true });
      fs.copyFileSync(src, dst);
    }
  }
  const testsSrc = path.join(pluginSrc, 'tests');
  const testsDst = path.join(hermesPluginDir, 'tests');
  if (fs.existsSync(testsSrc)) {
    copyDir(testsSrc, testsDst, true);
  }
}

console.log('Skill synchronization completed successfully across all targets.');