#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { createHash, createPublicKey } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pluginsRoot = path.join(root, 'plugins');
const failures = [];
const semver = /^\d+\.\d+\.\d+$/;
const appId = /^[a-z][a-z0-9]*(?:\.[a-z][a-z0-9-]*)+$/;
const intentId = /^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)*$/;
const allowedCapabilities = new Set([
  'ai.model.use',
  'runs.execute',
  'machine.diagnostics.read',
  'machine.files.read',
  'machine.files.write',
  'machine.shell.execute',
  'machine.docker.mutate',
  'workspace.runtime.execute',
  'workspace.runtime.manage',
  'integration.mcp.invoke',
  'integration.acp.execute',
  'browser.operate',
  'artifacts.read',
  'artifacts.write',
  'storage.app',
]);

const officialPublisherPath = path.join(root, 'catalog', 'official-publisher.json');
try {
  const publisher = JSON.parse(fs.readFileSync(officialPublisherPath, 'utf8'));
  if (
    publisher?.schemaVersion !== 1 ||
    typeof publisher?.keyId !== 'string' ||
    typeof publisher?.label !== 'string' ||
    !publisher.label.trim() ||
    typeof publisher?.publicKeyPem !== 'string'
  ) {
    failures.push('catalog/official-publisher.json: invalid publisher metadata');
  } else {
    const publicKey = createPublicKey(publisher.publicKeyPem);
    if (publicKey.asymmetricKeyType !== 'ed25519') {
      failures.push('catalog/official-publisher.json: public key must be Ed25519');
    } else {
      const publicDer = publicKey.export({ type: 'spki', format: 'der' });
      const derivedKeyId = `ed25519:${createHash('sha256').update(publicDer).digest('hex')}`;
      if (publisher.keyId !== derivedKeyId) {
        failures.push(
          `catalog/official-publisher.json: keyId mismatch; expected ${derivedKeyId}`,
        );
      }
    }
  }
} catch {
  failures.push('catalog/official-publisher.json: must contain a valid Ed25519 public key');
}

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
  if (typeof manifest.id !== 'string' || !appId.test(manifest.id)) failures.push(`${entry.name}: invalid id`);
  if (ids.has(manifest.id)) failures.push(`${entry.name}: duplicate id ${manifest.id}`);
  ids.add(manifest.id);
  if (entry.name !== manifest.id) failures.push(`${entry.name}: directory must match manifest id ${manifest.id}`);
  if (typeof manifest.version !== 'string' || !semver.test(manifest.version)) failures.push(`${entry.name}: version must be semver x.y.z`);
  if (typeof manifest.displayName !== 'string' || !manifest.displayName.trim()) failures.push(`${entry.name}: displayName is required`);
  if (typeof manifest.sdkVersion !== 'string' || !semver.test(manifest.sdkVersion)) failures.push(`${entry.name}: sdkVersion must be semver x.y.z`);
  if (!manifest.nexus || typeof manifest.nexus !== 'object' || Array.isArray(manifest.nexus)) {
    failures.push(`${entry.name}: nexus compatibility range is required`);
  } else {
    const minVersion = manifest.nexus.minVersion;
    const maxVersion = manifest.nexus.maxVersion;
    if (typeof minVersion !== 'string' || !semver.test(minVersion)) failures.push(`${entry.name}: nexus.minVersion must be semver x.y.z`);
    if (typeof maxVersion !== 'string' || !semver.test(maxVersion)) failures.push(`${entry.name}: nexus.maxVersion must be semver x.y.z`);
    if (semver.test(minVersion ?? '') && semver.test(maxVersion ?? '')) {
      const parts = (value) => value.split('.').map(Number);
      const compare = (left, right) => {
        const a = parts(left); const b = parts(right);
        for (let i = 0; i < 3; i += 1) if (a[i] !== b[i]) return a[i] - b[i];
        return 0;
      };
      if (compare(minVersion, maxVersion) > 0) failures.push(`${entry.name}: nexus.minVersion must not exceed nexus.maxVersion`);
    }
  }
  if (!Array.isArray(manifest.capabilities)) {
    failures.push(`${entry.name}: capabilities must be an array`);
  } else {
    const seen = new Set();
    for (const capability of manifest.capabilities) {
      if (typeof capability !== 'string' || !allowedCapabilities.has(capability)) failures.push(`${entry.name}: unknown capability ${String(capability)}`);
      if (seen.has(capability)) failures.push(`${entry.name}: duplicate capability ${capability}`);
      seen.add(capability);
    }
  }
  if (!Array.isArray(manifest.intents)) {
    failures.push(`${entry.name}: intents must be an array`);
  } else {
    const seen = new Set();
    for (const intent of manifest.intents) {
      if (!intent || typeof intent !== 'object' || Array.isArray(intent) || typeof intent.id !== 'string' || !intentId.test(intent.id) || !Number.isSafeInteger(intent.schemaVersion) || intent.schemaVersion < 1) {
        failures.push(`${entry.name}: invalid intent`);
        continue;
      }
      if (seen.has(intent.id)) failures.push(`${entry.name}: duplicate intent ${intent.id}`);
      seen.add(intent.id);
    }
  }
  if (manifest.agents !== undefined) {
    if (!Array.isArray(manifest.agents) || manifest.agents.length > 32) {
      failures.push(`${entry.name}: agents must contain at most 32 definitions`);
    } else {
      const seen = new Set();
      for (const agent of manifest.agents) {
        if (!agent || typeof agent !== 'object' || Array.isArray(agent) || typeof agent.id !== 'string' || !intentId.test(agent.id) || typeof agent.version !== 'string' || !semver.test(agent.version) || typeof agent.displayName !== 'string' || !agent.displayName.trim() || typeof agent.description !== 'string' || !agent.description.trim() || !Array.isArray(agent.requiredModelCapabilities) || agent.requiredModelCapabilities.length > 32 || agent.requiredModelCapabilities.some((value) => typeof value !== 'string' || !value.trim()) || new Set(agent.requiredModelCapabilities).size !== agent.requiredModelCapabilities.length) {
          failures.push(`${entry.name}: invalid AgentDefinition`);
          continue;
        }
        if (seen.has(agent.id)) failures.push(`${entry.name}: duplicate AgentDefinition ${agent.id}`);
        seen.add(agent.id);
      }
    }
  }
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
      const requiredCapabilities = (fields.get('requiredCapabilities') ?? '').split(',').map((value) => value.trim()).filter(Boolean);
      if (!/^[a-z0-9][a-z0-9._-]{2,127}$/.test(id)) failures.push(`${entry.name}: invalid Skill id in ${skillDir.name}`);
      if (skillIds.has(id)) failures.push(`${entry.name}: duplicate Skill id ${id}`);
      skillIds.add(id);
      if (!name || Buffer.byteLength(name, 'utf8') > 128) failures.push(`${entry.name}: invalid Skill name in ${skillDir.name}`);
      if (!semver.test(version)) failures.push(`${entry.name}: invalid Skill version in ${skillDir.name}`);
      if (!description || Buffer.byteLength(description, 'utf8') > 1024) failures.push(`${entry.name}: invalid Skill description in ${skillDir.name}`);
      for (const capability of requiredCapabilities) {
        if (!allowedCapabilities.has(capability)) failures.push(`${entry.name}: unknown Skill capability ${capability} in ${skillDir.name}`);
        if (!manifest.capabilities?.includes(capability)) failures.push(`${entry.name}: Skill ${id || skillDir.name} requires undeclared capability ${capability}`);
      }
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
