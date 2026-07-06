import { StaleInstanceScanner } from "./stale-instance-scanner";

export class StaleInstanceCleaner {
	private _running = false;
	private readonly _scanner: StaleInstanceScanner;

	constructor(prefix: string) {
		this._scanner = new StaleInstanceScanner(prefix);
	}

	get isRunning(): boolean {
		return this._running;
	}

	start(): void {
		this._running = true;
	}

	stop(): void {
		this._running = false;
	}

	async cleanupNow(): Promise<number> {
		return this._scanner.removeStaleInstances();
	}

	async isStaleByHeartbeat(instanceId: string): Promise<boolean> {
		return this._scanner.isStaleByHeartbeat(instanceId);
	}

	async removeStaleInstances(): Promise<number> {
		return this._scanner.removeStaleInstances();
	}
}
