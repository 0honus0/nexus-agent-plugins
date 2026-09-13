#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pluginsRoot = path.join(root, 'plugins');
const failures = [];
const ids = new Set();
for (const entry of fs.readdirSync(pluginsRoot, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
  if (!entry.isDirectory()) continue;
  const pluginRoot = path.join(pluginsRoot, entry.name);
  const manifestPath = path.join(pluginRoot, 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    failures.push(`${entry.name}: manifest.json is required`);
    continue;
  }
  let manifest;
  try { manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')); }
  catch { failures.push(`${entry.name}: manifest.json must be valid JSON`); continue; }
  if (manifest.schemaVersion !== 1) failures.push(`${entry.name}: schemaVersion must be 1`);
  if (typeof manifest.id !== 'string' || !/^[a-z0-9]+(?:[.-][a-z0-9]+)+$/.test(manifest.id)) failures.push(`${entry.name}: invalid id`);
  if (ids.has(manifest.id)) failures.push(`${entry.name}: duplicate id ${manifest.id}`);
  ids.add(manifest.id);
  if (entry.name !== manifest.id) failures.push(`${entry.name}: directory must match manifest id ${manifest.id}`);
  if (typeof manifest.version !== 'string' || !/^\d+\.\d+\.\d+$/.test(manifest.version)) failures.push(`${entry.name}: version must be semver x.y.z`);
  if (manifest.targets !== undefined) {
    if (!manifest.targets || typeof manifest.targets !== 'object' || Array.isArray(manifest.targets)) {
      failures.push(`${entry.name}: targets must be an object`);
    } else {
      for (const target of ['frontend', 'backend', 'runner']) {
        const spec = manifest.targets[target];
        if (spec === undefined) continue;
        const expectedPrefix = `${target}/`;
        if (!spec || typeof spec !== 'object' || Array.isArray(spec) || typeof spec.entry !== 'string' || !spec.entry.startsWith(expectedPrefix) || spec.entry.includes('..')) {
          failures.push(`${entry.name}: invalid ${target} target entry`);
          continue;
        }
        if (!fs.existsSync(path.join(pluginRoot, spec.entry))) failures.push(`${entry.name}: missing target entry ${spec.entry}`);
      }
    }
  }
  const walk = (dir) => {
    for (const child of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, child.name);
      if (child.isSymbolicLink()) failures.push(`${path.relative(root, full)}: symlinks are forbidden`);
      else if (child.isDirectory()) walk(full);
      else if (!child.isFile()) failures.push(`${path.relative(root, full)}: unsupported filesystem entry`);
    }
  };
  walk(pluginRoot);
  const skillsRoot = path.join(pluginRoot, 'skills');
  if (fs.existsSync(skillsRoot)) {
    const skillIds = new Set();
    const skillEntries = fs.readdirSync(skillsRoot, { withFileTypes: true });
    for (const skillEntry of skillEntries) {
      if (!skillEntry.isDirectory()) failures.push(`${entry.name}: skills/ may contain only Skill directories`);
    }
    const skillDirs = skillEntries.filter((candidate) => candidate.isDirectory());
    if (skillDirs.length > 64) failures.push(`${entry.name}: at most 64 Skills are allowed`);
    for (const skillDir of skillDirs) {
      const childEntries = fs.readdirSync(path.join(skillsRoot, skillDir.name), { withFileTypes: true });
      if (childEntries.length !== 1 || !childEntries[0]?.isFile() || childEntries[0].name !== 'SKILL.md') {
        failures.push(`${entry.name}: skills/${skillDir.name}/ must contain exactly one SKILL.md file`);
      }
      const skillPath = path.join(skillsRoot, skillDir.name, 'SKILL.md');
      if (!fs.existsSync(skillPath)) { failures.push(`${entry.name}: missing skills/${skillDir.name}/SKILL.md`); continue; }
      const content = fs.readFileSync(skillPath, 'utf8');
      const end = content.startsWith('---\n') ? content.indexOf('\n---\n', 4) : -1;
      if (end < 0) { failures.push(`${entry.name}: invalid Skill frontmatter in ${skillDir.name}`); continue; }
      const fields = new Map();
      for (const line of content.slice(4, end).split('\n')) {
        const separator = line.indexOf(':');
        if (separator > 0) fields.set(line.slice(0, separator).trim(), line.slice(separator + 1).trim());
      }
      const id = fields.get('id') ?? '';
      const name = fields.get('name') ?? '';
      const version = fields.get('version') ?? '';
      const description = fields.get('description') ?? '';
      if (!/^[a-z0-9][a-z0-9._-]{2,127}$/.test(id)) failures.push(`${entry.name}: invalid Skill id in ${skillDir.name}`);
      if (skillIds.has(id)) failures.push(`${entry.name}: duplicate Skill id ${id}`);
      skillIds.add(id);
      if (!name || Buffer.byteLength(name, 'utf8') > 128) failures.push(`${entry.name}: invalid Skill name in ${skillDir.name}`);
      if (!/^\d+\.\d+\.\d+$/.test(version)) failures.push(`${entry.name}: invalid Skill version in ${skillDir.name}`);
      if (!description || Buffer.byteLength(description, 'utf8') > 1024) failures.push(`${entry.name}: invalid Skill description in ${skillDir.name}`);
      if (Buffer.byteLength(content.slice(end + 5), 'utf8') > 12 * 1024) failures.push(`${entry.name}: Skill body too large in ${skillDir.name}`);
    }
  }
}
if (!ids.size) failures.push('plugins/: at least one plugin is required');
if (failures.length) {
  console.error('Plugin repository check failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}
console.log(`Plugin repository check passed: ${ids.size} plugin(s).`);
