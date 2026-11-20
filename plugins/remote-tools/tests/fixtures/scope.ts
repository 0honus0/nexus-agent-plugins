export function testScope() {
	const controller = new AbortController();
	const cleanups = new Set<() => void | Promise<void>>();

	return {
		signal: controller.signal,

		onDispose(cleanup: () => void | Promise<void>) {
			cleanups.add(cleanup);
			return () => {
				cleanups.delete(cleanup);
			};
		},

		async stop() {
			controller.abort();
			await Promise.all([...cleanups].map((cleanup) => cleanup()));
		},
	};
}
