/** Resolves after `ms`, or earlier when `signal` aborts. */
export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
	return new Promise((resolve) => {
		const done = () => {
			clearTimeout(timer);
			resolve();
		};
		const timer = setTimeout(done, ms);
		timer.unref();
		signal?.addEventListener("abort", done, { once: true });
	});
}
