import { normalizeError } from "@trading-model/common/utils/errors";
import type { DlqEntry } from "@trading-model/contracts/dlq-types";
import { logger } from "@trading-model/http/infrastructure/logger";
import type { DeadLetterStorePort } from "../../application/ports/dead-letter-store-port";
import {
	DLQ_FALLBACK_PENDING,
	DLQ_FORWARD_FAILURES_TOTAL,
	DLQ_REJECTED_TOTAL,
} from "../../config/metrics";
import {
	DrainOutcome,
	type FileDlqRepository,
} from "../../infrastructure/fallback/dlq-repository";
import { isPermanentRejection } from "./http-dead-letter-store";

/**
 * Sends dead letters to dlq-service and keeps them in the local file while it
 * cannot take them; `forwardPending` sends the file's entries once it can.
 * The file is on a volume that does not outlive the pod (K8s `emptyDir`):
 * entries still in it when the pod is deleted are lost, hence the gauge
 * `mm_dlq_fallback_pending` and its alert.
 */
export class ForwardingDeadLetterStore implements DeadLetterStorePort {
	constructor(
		private readonly _remote: DeadLetterStorePort,
		private readonly _file: FileDlqRepository
	) {}

	async insert(entry: DlqEntry): Promise<void> {
		const outcome = await this._forward(entry);
		if (outcome === DrainOutcome.Sent) {
			return;
		}
		await this._file.insert(entry);
		if (outcome === DrainOutcome.Rejected) {
			// The next forward moves it to the `.rejected` file, for an operator.
			return;
		}
		DLQ_FALLBACK_PENDING.inc();
	}

	/** Sends the entries of the local file to dlq-service. */
	async forwardPending(): Promise<void> {
		const result = await this._file.drain((entry) => this._forward(entry));
		DLQ_FALLBACK_PENDING.set(await this._file.count());
		if (result.sent > 0 || result.rejected > 0) {
			logger.info("Forwarded locally kept dead letters to dlq-service", {
				context: { ...result },
			});
		}
	}

	private async _forward(entry: DlqEntry): Promise<DrainOutcome> {
		try {
			await this._remote.insert(entry);
			return DrainOutcome.Sent;
		} catch (err) {
			if (isPermanentRejection(err)) {
				DLQ_REJECTED_TOTAL.inc();
				logger.error("dlq-service rejected a dead letter", {
					context: { topic: entry.topic, reason: entry.reason },
					error: normalizeError(err),
				});
				return DrainOutcome.Rejected;
			}
			DLQ_FORWARD_FAILURES_TOTAL.inc();
			logger.warn("dlq-service unavailable: dead letter kept locally", {
				context: { topic: entry.topic, reason: entry.reason },
				error: normalizeError(err),
			});
			return DrainOutcome.Kept;
		}
	}
}
