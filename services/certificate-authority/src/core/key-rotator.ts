import { logger } from "@trading-model/common/config/logger";

export interface CaKeyRotator {
	getCurrentKeyId(): string;
	getKeyVersion(): number;
	rotateKey(): Promise<string>;
	cleanupKeyHistory(retentionCount: number): Promise<void>;
}

export interface KeyRotatorOptions {
	ca: CaKeyRotator;
	intervalMs: number;
	retentionCount: number;
}

export class KeyRotator {
	private readonly _options: KeyRotatorOptions;
	private _timer: ReturnType<typeof setInterval> | null = null;

	constructor(options: KeyRotatorOptions) {
		this._options = options;
	}

	private _logRotationStart(): void {
		logger.info("Starting CA key rotator", {
			context: { intervalMs: this._options.intervalMs, retentionCount: this._options.retentionCount },
		});
	}

	private _scheduleRotation(): void {
		this._timer = setInterval(() => {
			this._rotate().catch((err) => {
				logger.error("CA key rotation failed", { context: { err } });
			});
		}, this._options.intervalMs);
	}

	start(): void {
		if (this._timer) {
			return;
		}
		this._logRotationStart();
		this._scheduleRotation();
	}

	stop(): void {
		if (this._timer) {
			clearInterval(this._timer);
			this._timer = null;
			logger.info("CA key rotator stopped");
		}
	}

	private async _rotate(): Promise<void> {
		const previousKeyId = this._options.ca.getCurrentKeyId();
		const previousVersion = this._options.ca.getKeyVersion();
		const newKeyId = await this._options.ca.rotateKey();
		await this._options.ca.cleanupKeyHistory(this._options.retentionCount);
		logger.info("CA key rotated", {
			context: { previousKeyId, previousVersion, newKeyId, newVersion: this._options.ca.getKeyVersion() },
		});
	}
}
