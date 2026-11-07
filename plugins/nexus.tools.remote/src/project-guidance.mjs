import { posix } from 'node:path';
import { createHash } from 'node:crypto';
import { REMOTE_FILE_TEXT_PAGE_MAX_BYTES } from '@nexus-terminal/shared/remote/files/values';
import { AgentFailure } from '../../../lib/model-tools/failure.mjs';

/** Project instruction discovery is a package algorithm; bindings remain Run-owned Host state. */
export async function projectGuidance(input, call, signal) {
	async function request(params) {
		signal.throwIfAborted();
		const value = await call(params);
		signal.throwIfAborted();
		return value;
	}

	const connectionId = input.connectionId;
	if (input.input.action === 'clear') {
		await request({ operation: 'project.bindingWrite', connectionId, directory: null });
		return { binding: null, instructions: [] };
	}
	const binding =
		input.input.action === 'bind'
			? { directory: input.input.directory }
			: (await request({ operation: 'project.bindingRead', connectionId })).binding;
	if (binding === null) {
		return { binding: null, instructions: [] };
	}
	const path = input.input.action === 'read' ? (input.input.path ?? binding.directory) : binding.directory;
	const relative = posix.relative(binding.directory, path);
	if (relative === '..' || relative.startsWith('../') || posix.isAbsolute(relative)) {
		throw new AgentFailure('invalid_input');
	}
	const directories = [binding.directory];
	let current = binding.directory;
	for (const segment of relative.split('/').filter(Boolean)) {
		current = posix.join(current, segment);
		directories.push(current);
	}
	const instructions = [];
	for (const directory of directories) {
		const entries = [];
		let after = '';
		do {
			signal.throwIfAborted();
			const page = await request({ operation: 'remote.listPage', connectionId, path: directory, after });
			if (page.status !== 'ok') {
				throw new AgentFailure(page.status);
			}
			entries.push(...page.value.entries.filter((entry) => /^agents?\.md$/iu.test(entry.name)));
			after = page.value.nextAfter;
		} while (after !== null);
		for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
			if (entry.kind !== 'file') {
				throw new AgentFailure('invalid_input');
			}
			const filePath = posix.join(directory, entry.name);
			const parts = [];
			const hash = createHash('sha256');
			let offset = 0;
			let fingerprint = null;
			do {
				const page = await request({
					operation: 'remote.readTextPage',
					connectionId,
					path: filePath,
					offset,
					maxBytes: REMOTE_FILE_TEXT_PAGE_MAX_BYTES,
				});
				if (page.status !== 'ok') {
					throw new AgentFailure(page.status);
				}
				const value = page.value;
				const bytes = Buffer.byteLength(value.text, 'utf8');
				const next = offset + bytes;
				if (
					value.path !== filePath ||
					value.offset !== offset ||
					value.bytes !== bytes ||
					value.sizeBytes !== entry.size ||
					(fingerprint !== null && value.fingerprint !== fingerprint) ||
					createHash('sha256').update(value.text).digest('hex') !== value.pageSha256 ||
					(value.nextOffset === null ? next !== entry.size : value.nextOffset !== next || next <= offset)
				) {
					throw new AgentFailure('version_conflict');
				}
				fingerprint = value.fingerprint;
				parts.push(value.text);
				hash.update(value.text);
				offset = value.nextOffset;
			} while (offset !== null);
			instructions.push({
				path: filePath,
				scopePath: directory,
				text: parts.join(''),
				sha256: hash.digest('hex'),
			});
		}
	}
	if (input.input.action === 'bind') {
		await request({ operation: 'project.bindingWrite', connectionId, directory: binding.directory });
	}
	return { binding: { connectionId, directory: binding.directory }, instructions };
}
