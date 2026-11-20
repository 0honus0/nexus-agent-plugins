import { createHash, randomUUID } from 'node:crypto';
import { promisify } from 'node:util';
import { quote } from 'shell-quote';
import type { SshConnectionApi } from '@nexus-terminal/ssh/ssh-api';
import type { RemoteCommandExecutor } from './remote-command.js';
import type { RemoteToolsSessionApi } from './remote-tools-api.js';
import { RemoteTransferInputSchema } from '../shared/remote-transfer-types.js';
import { RemoteToolsError, RemoteCommandError } from './remote-tools-error.js';
import { openRemoteSftp } from './remote-sftp.js';

/** Copies only into caller-owned staging. unavailable is returned before dispatch only.
 * Unknown native exit retains destination staging rather than retrying under a live writer.
 */
export class RemoteTransfer {
	constructor(
		private readonly connection: Pick<SshConnectionApi, 'sftp'>,
		private readonly commands: Pick<RemoteCommandExecutor, 'script' | 'stream'>,
		private readonly lifetime: AbortSignal,
	) {}

	async copy(
		...[input, options]: Parameters<RemoteToolsSessionApi['copyFiles']>
	): ReturnType<RemoteToolsSessionApi['copyFiles']> {
		const value = RemoteTransferInputSchema.parse(input);
		const signal = options?.signal ? AbortSignal.any([this.lifetime, options.signal]) : this.lifetime;
		signal.throwIfAborted();

		const run = async (script: string) => {
			const result = await this.commands.script(script, signal, { timeoutMs: 20000 });
			if (result.code === null) throw new RemoteToolsError('REMOTE_TOOLS_EXEC_OUTCOME_UNKNOWN');
			return result.code === 0;
		};

		const available = async (tool: string) => {
			try {
				return await run('command -v ' + quote([tool]) + ' >/dev/null 2>&1');
			} catch {
				signal.throwIfAborted();
				return false;
			}
		};

		if (!value.target) {
			if (!(await available('cp'))) return { state: 'unavailable', reason: 'tools' };
			options?.onMethod?.('local');
			await this.#executeCopy(
				'exec cp -a -- ' + quote([...value.paths, value.destination + '/']),
				signal,
				options?.onProgress,
			);
			return { state: 'copied', method: 'local' };
		}
		const target = value.target;
		const password = target.authentication.type === 'password' || !!target.authentication.passphrase;
		if (!(await available('ssh')) || (password && !(await available('sshpass'))))
			return { state: 'unavailable', reason: 'tools' };
		const method =
			(await available('rsync')) && (await run('rsync --info=progress2 --outbuf=L --version >/dev/null 2>&1'))
				? 'rsync'
				: value.filesOnly && (await available('scp'))
					? 'scp'
					: undefined;
		if (!method) return { state: 'unavailable', reason: 'tools' };
		const bytes = Buffer.from(target.hostKey);
		if (bytes.length < 5 || bytes.length > 16384) throw new RemoteToolsError('REMOTE_TOOLS_TRANSFER_HOST_KEY');
		const length = bytes.readUInt32BE(0),
			algorithm = bytes.subarray(4, 4 + length).toString('ascii');
		if (
			length > bytes.length - 4 ||
			!/^[a-zA-Z0-9@._+-]+$/.test(algorithm) ||
			'SHA256:' + createHash('sha256').update(bytes).digest('base64').replace(/=+$/, '') !== target.fingerprint
		)
			throw new RemoteToolsError('REMOTE_TOOLS_TRANSFER_HOST_KEY');
		const directory = '/tmp/nexus-transfer-' + randomUUID();
		const sftp = await openRemoteSftp(this.connection, signal);
		let created = false;
		let failure: unknown;
		try {
			signal.throwIfAborted();
			try {
				await new Promise<void>((resolve, reject) => {
					sftp.mkdir(directory, { mode: 0o700 }, (cause) => (cause ? reject(cause) : resolve()));
				});
			} catch (cause) {
				throw new RemoteToolsError('REMOTE_TOOLS_TRANSFER_SETUP', { cause });
			}
			created = true;
			const host = target.host.replace(/^\[|\]$/g, '');
			const known = `${target.port === 22 ? host : '[' + host + ']:' + target.port} ${algorithm} ${bytes.toString('base64')}\n`;

			async function write(name: string, text: string): Promise<void> {
				signal.throwIfAborted();
				const bytes = Buffer.from(text);
				try {
					await new Promise<void>((resolve, reject) => {
						sftp.writeFile(directory + '/' + name, bytes, { mode: 0o600, flag: 'wx' }, (cause) =>
							cause ? reject(cause) : resolve(),
						);
					});
				} finally {
					bytes.fill(0);
				}
			}

			await write('known_hosts', known);
			const ssh = [
				'ssh',
				'-F',
				'/dev/null',
				'-o',
				'StrictHostKeyChecking=yes',
				'-o',
				'GlobalKnownHostsFile=/dev/null',
				'-o',
				'UserKnownHostsFile=' + directory + '/known_hosts',
				'-o',
				'IdentitiesOnly=yes',
				'-o',
				'ClearAllForwardings=yes',
				'-o',
				'ConnectTimeout=10',
				'-o',
				'ServerAliveInterval=15',
				'-o',
				'ServerAliveCountMax=2',
				'-o',
				'NumberOfPasswordPrompts=1',
				'-p',
				String(target.port),
			];
			const prefix: string[] = [];
			if (target.authentication.type === 'password') {
				await write('password', target.authentication.password);
				prefix.push('sshpass', '-f', directory + '/password');
				ssh.push('-o', 'PreferredAuthentications=password,keyboard-interactive');
			} else {
				await write('key', target.authentication.privateKey + '\n');
				ssh.push('-i', directory + '/key');
				if (target.authentication.passphrase) {
					await write('password', target.authentication.passphrase);
					prefix.push('sshpass', '-P', 'Enter passphrase for key', '-f', directory + '/password');
				} else ssh.push('-o', 'BatchMode=yes');
			}
			// rsync parses -e itself and does not decode shell-quote's backslash escapes (e.g. \=).
			// These arguments are generated options, numeric ports and UUID paths, never user text.
			const transport = [...prefix, ...ssh].map((argument) => "'" + argument + "'").join(' ');
			if (!(await run(transport + ' ' + quote([target.username + '@' + host, 'true']))))
				return { state: 'unavailable', reason: 'unreachable' };
			if (
				!(await run(
					transport +
						' ' +
						quote([
							target.username + '@' + host,
							(method === 'rsync' ? 'rsync -s --version' : 'command -v scp') + ' >/dev/null 2>&1',
						]),
				))
			)
				return { state: 'unavailable', reason: 'tools' };
			// The UUID stage was created through the caller's verified destination connection.
			// Its presence also detects DNS/loopback addresses resolving differently from the source.
			if (
				!(await run(
					transport + ' ' + quote([target.username + '@' + host, 'test -d ' + quote([value.destination])]),
				))
			)
				return { state: 'unavailable', reason: 'unreachable' };
			const remoteHost = host.includes(':') ? '[' + host + ']' : host;
			let command: string;
			if (method === 'rsync')
				command =
					'LC_ALL=C exec rsync -aWs --ignore-times --info=progress2 --outbuf=L --no-inc-recursive -e ' +
					quote([transport]) +
					' -- ' +
					quote([...value.paths, target.username + '@' + remoteHost + ':' + value.destination + '/']);
			else {
				await write(
					'ssh-client',
					'#!/bin/sh\nexec ' + (prefix.length ? quote(prefix) + ' ' : '') + 'ssh "$@"\n',
				);
				await promisify(sftp.chmod.bind(sftp))(directory + '/ssh-client', 0o700);
				const opts = ssh
					.filter((_value, index) => index !== ssh.indexOf('-p') && index !== ssh.indexOf('-p') + 1)
					.slice(1);
				command =
					'LC_ALL=C exec scp -O -p -S ' +
					quote([directory + '/ssh-client']) +
					' ' +
					quote([
						...opts,
						'-P',
						String(target.port),
						'--',
						...value.paths,
						target.username + '@' + remoteHost + ':' + quote([value.destination + '/']),
					]);
			}
			options?.onMethod?.(method);
			await this.#executeCopy(command, signal, options?.onProgress);
			return { state: 'copied', method };
		} catch (cause) {
			failure = cause;
			throw cause;
		} finally {
			try {
				if (created) {
					// 等待已发出的 SFTP 写入，随后清理本次创建的认证临时文件。
					const unlink = promisify(sftp.unlink.bind(sftp));
					for (const name of ['key', 'password', 'known_hosts', 'ssh-client']) {
						try {
							await unlink(directory + '/' + name);
						} catch (cause) {
							if ((cause as { code?: number }).code !== 2) throw cause;
						}
					}
					await promisify(sftp.rmdir.bind(sftp))(directory);
				}
			} catch (cause) {
				if (failure) throw failure;
				throw new RemoteToolsError('REMOTE_TOOLS_TRANSFER_CLEANUP');
			} finally {
				sftp.end();
			}
		}
	}

	async #executeCopy(command: string, signal: AbortSignal, progress?: (bytes: number) => void): Promise<void> {
		let line = '';
		let code: number | null;

		try {
			({ code } = await this.commands.stream(command, signal, (chunk) => {
				line += chunk.toString('utf8');
				const lines = line.split(/[\r\n]/u);
				line = lines.pop()!.slice(-4096);
				for (const value of lines) {
					const match = /^\s*([\d,]+)\s+\d+%/u.exec(value);
					if (match) progress?.(Number(match[1].replaceAll(',', '')));
				}
			}));
		} catch (cause) {
			throw new RemoteToolsError('REMOTE_TOOLS_TRANSFER_UNKNOWN', { cause });
		}
		if (code === null) throw new RemoteToolsError('REMOTE_TOOLS_TRANSFER_UNKNOWN');
		if (code !== 0) throw new RemoteCommandError(code);
	}
}
