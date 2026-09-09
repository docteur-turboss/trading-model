import { DurationMs } from "../domain/primitives";
import { TimerHandle } from "./timer-handle";

export interface PeriodicSweeperOptions {
	autoStart?: boolean;
}

export class PeriodicSweeper {
	private readonly _handle = new TimerHandle();

	constructor(
		private readonly _sweepFn: () => void,
		private readonly _intervalMs: number,
		options?: PeriodicSweeperOptions
	) {
		if (options?.autoStart) {
			this.start();
		}
	}

	get isRunning(): boolean {
		return this._handle.isRunning;
	}

	start(): void {
		const initialDelay = Math.floor(Math.random() * this._intervalMs);
		setTimeout(() => {
			this._handle.startInterval(() => {
				this._sweepFn();
			}, DurationMs.of(this._intervalMs));
			this._handle.unref();
		}, initialDelay);
	}

	stop(): void {
		this._handle.stop();
	}
}
