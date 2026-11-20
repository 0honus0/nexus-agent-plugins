import type { ClientChannel } from 'ssh2';
import type { WebSocket } from 'ws';

const highWater = 8 * 1024 * 1024;
const lowWater = 1024 * 1024;

/** Bound SSH reads using the WS send buffer, without a browser-consumption ACK.
 * Parser work and network pressure hold separate locks: releasing either cannot resume the other.
 * An unattached/suspended session keeps consuming output into its bounded headless scrollback.
 */
export function createTerminalBackpressure(channel: ClientChannel, socket: () => WebSocket | undefined) {
	let parsing = 0,
		congested = false,
		paused = false,
		disposed = false;
	let timer: ReturnType<typeof setInterval> | undefined;

	function apply() {
		if (disposed) return;
		const next = parsing > 0 || congested;
		if (paused === next) return;
		paused = next;
		if (next) channel.pause();
		else channel.resume();
	}

	function check() {
		if (disposed) return;
		const current = socket();
		const bytes = current?.readyState === 1 ? current.bufferedAmount : 0;
		congested = congested ? bytes > lowWater : bytes >= highWater;
		if (congested && !timer) {
			timer = setInterval(check, 50);
			timer.unref();
		} else if (!congested) {
			clearInterval(timer);
			timer = undefined;
		}
		apply();
	}

	return {
		check,

		parsing(value: boolean) {
			parsing = Math.max(0, parsing + (value ? 1 : -1));
			check();
		},

		dispose() {
			disposed = true;
			clearInterval(timer);
			timer = undefined;
		},
	};
}
