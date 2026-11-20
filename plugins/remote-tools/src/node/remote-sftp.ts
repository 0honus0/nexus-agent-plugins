import { addAbortListener } from 'node:events';
import type { SshConnectionApi } from '@nexus-terminal/ssh/ssh-api';
import type { SFTPWrapper } from 'ssh2';

/** 作用域可以在 SFTP 打开前结束。迟到的通道仍由发起方释放。 */
export async function openRemoteSftp(
	connection: Pick<SshConnectionApi, 'sftp'>,
	signal: AbortSignal,
): Promise<SFTPWrapper> {
	signal.throwIfAborted();
	const canceled = Promise.withResolvers<never>();
	using abort = addAbortListener(signal, () => canceled.reject(signal.reason));
	const opening = connection.sftp().then((sftp) => {
		if (signal.aborted) {
			sftp.end();
			throw signal.reason;
		}
		return sftp;
	});
	return await Promise.race([opening, canceled.promise]);
}
