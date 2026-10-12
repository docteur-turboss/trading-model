import { randomUUID } from "node:crypto";
import { HELPER } from "@trading-model/broker-message";
import { TrainingEvent } from "@trading-model/common/config/event.types";
import {
	toCorrelationId,
	toInstanceId,
	toMessageId,
	toServiceId,
	toTopic,
} from "@trading-model/common/domain/primitives";
import type { MessageMetadata } from "@trading-model/validation/domain/contracts/message.types";
import type { MessageManager } from "../config/message-manager";
import type { TradingSymbol } from "../core/market-data-types";
import type { BestAgentSummary } from "../core/training-state";

const TOPIC = toTopic(TrainingEvent.ModelPublished);

interface PublishContext {
	trainerId: string;
	instanceId: string;
}

function buildMetadata(ctx: PublishContext): MessageMetadata {
	return new HELPER.metadataBuilder(TOPIC, TrainingEvent.ModelPublished, {
		instanceId: toInstanceId(ctx.instanceId),
		serviceName: toServiceId(ctx.trainerId),
	})
		.setDelivery({
			mode: "at-least-once" as never,
			deduplicationId: toMessageId(randomUUID()),
		})
		.setIds({
			causationId: toCorrelationId(randomUUID()),
			correlationId: toCorrelationId(randomUUID()),
		})
		.toJSON();
}

export class ModelPublisher {
	constructor(
		private readonly _messageManager: typeof MessageManager,
		private readonly _ctx: PublishContext
	) {}

	async publish(
		symbol: TradingSymbol,
		summary: BestAgentSummary
	): Promise<void> {
		const payload = {
			symbol,
			generation: summary.generation,
			fitness: summary.fitness,
			sharpe: summary.sharpe,
			avgPnl: summary.avgPnl,
			maxDrawdown: summary.complexityPenalty,
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

		const metadata = buildMetadata(this._ctx);
		await this._messageManager.post.indirect(payload, metadata);
	}
}
