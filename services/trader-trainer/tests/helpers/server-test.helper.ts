import { createServer } from "../../src/app/server";
import type { Trainer } from "../../src/core/trainer";

export interface TestServerHandle {
	app: ReturnType<typeof createServer>;
	close: () => Promise<void>;
}

const USED_PORTS = new Set<number>();

function nextPort(): number {
	let port = 0;
	for (let p = 18900; p < 19000; p++) {
		if (!USED_PORTS.has(p)) {
			port = p;
			USED_PORTS.add(p);
			return port;
		}
	}
	throw new Error("No available test ports");
}

export async function startTestServer(
	trainer: Trainer
): Promise<TestServerHandle> {
	const port = nextPort();

	const app = createServer(trainer);

	await new Promise<void>((resolve, reject) => {
		app.listen(port, () => resolve());
		app.on("error", reject);
	});

	return {
		app,
		close: () =>
			new Promise<void>((resolve) => {
				app.close(() => {
					USED_PORTS.delete(port);
					resolve();
				});
			}),
	};
}
