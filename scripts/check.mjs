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
}
if (!ids.size) failures.push('plugins/: at least one plugin is required');
if (failures.length) {
  console.error('Plugin repository check failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}
console.log(`Plugin repository check passed: ${ids.size} plugin(s).`);
