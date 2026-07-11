export class DlqRetryWithBackoff {
	computeDelay(attempt: number): number {
		return Math.round(
			Math.min(200 * 2 ** (attempt - 1), 5000) * (0.5 + Math.random() * 0.5)
		);
	}

	wait(delay: number): Promise<void> {
		return new Promise((resolve) => {
			const timer = setTimeout(resolve, delay);
			timer.unref();
		});
	}
}
