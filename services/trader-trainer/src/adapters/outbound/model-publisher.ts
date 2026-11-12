import { createHash, randomUUID } from "node:crypto";
import { HELPER } from "@trading-model/broker-message";
import { DeliveryMode } from "@trading-model/contracts/delivery-mode";
import type { MessageMetadata } from "@trading-model/contracts/message-types";
import { TrainingEvent } from "@trading-model/contracts/training-events";
import {
	toCorrelationId,
	toInstanceId,
	toMessageId,
	toServiceId,
	toTopic,
} from "@trading-model/primitives/primitives";
import type { MessageManager } from "../../config/message-manager";
import type { TradingSymbol } from "../../domain/market-data-types";
import type {
	ModelPublisherPort,
	StoredModelRef,
} from "../../domain/ports/model-publisher.port";
import type { BestAgentSummary } from "../../domain/training-state";

const TOPIC = toTopic(TrainingEvent.ModelPublished);

interface PublishContext {
	trainerId: string;
	instanceId: string;
}

/** Same `(symbol, version)` gives the same id, so a replay is recognised. */
function deduplicationIdOf(symbol: string, version: string) {
	const digest = createHash("sha256")
		.update(`${symbol}:${version}`)
		.digest("hex");
	return toMessageId(
		`${digest.slice(0, 8)}-${digest.slice(8, 12)}-${digest.slice(12, 16)}-${digest.slice(16, 20)}-${digest.slice(20, 32)}`
	);
}

function buildMetadata(
	ctx: PublishContext,
	deduplicationId: ReturnType<typeof toMessageId>
): MessageMetadata {
	return new HELPER.metadataBuilder(TOPIC, TrainingEvent.ModelPublished, {
		instanceId: toInstanceId(ctx.instanceId),
		serviceName: toServiceId(ctx.trainerId),
	})
		.setDelivery({
			mode: DeliveryMode.AtLeastOnce,
			deduplicationId,
		})
		.setIds({
			causationId: toCorrelationId(randomUUID()),
			correlationId: toCorrelationId(randomUUID()),
		})
		.toJSON();
}

export class ModelPublisher implements ModelPublisherPort {
	constructor(
		private readonly _messageManager: typeof MessageManager,
		private readonly _ctx: PublishContext
	) {}

	async publish(
		symbol: TradingSymbol,
		summary: BestAgentSummary,
		stored: StoredModelRef
	): Promise<void> {
		const payload = {
			version: stored.version,
			sha256: stored.sha256,
			symbol,
			generation: summary.generation,
			fitness: summary.fitness,
			sharpe: summary.sharpe,
			avgPnl: summary.avgPnl,
			maxDrawdown: summary.maxDrawdown,
			evaluatedOn: summary.evaluatedOn,
			agentId: summary.id,
			gaControl: {
				populationSize: summary.gaControl.populationSize,
				elitismFraction: summary.gaControl.elitismFraction,
				survivorFraction: summary.gaControl.survivorFraction,
				episodesPerIndividual: summary.gaControl.episodesPerIndividual,
				selectionType: summary.gaControl.selectionType,
				fitnessType: summary.gaControl.fitnessType,
			},
			network: {
				inputDim: summary.network.inputDim,
				outputDim: summary.network.outputDim,
				hiddenLayers: summary.network.hiddenLayers.map((hiddenLayer) => ({
					neurons: hiddenLayer.neurons,
					activation: hiddenLayer.activation,
				})),
			},
			rl: {
				gamma: summary.rl.gamma,
				learningRate: summary.rl.learningRate,
				epsilonStart: summary.rl.epsilonStart,
				epsilonMin: summary.rl.epsilonMin,
				epsilonDecay: summary.rl.epsilonDecay,
			},
		};

		const metadata = buildMetadata(
			this._ctx,
			deduplicationIdOf(symbol, stored.version)
		);
		await this._messageManager.post.indirect(payload, metadata);
	}
}
