import { randomUUID } from "node:crypto";
import { HELPER } from "@trading-model/broker-message";
import { DeliveryMode } from "@trading-model/contracts/delivery-mode";
import type { MessageMetadata } from "@trading-model/contracts/message-types";
import { TrainingEvent } from "@trading-model/contracts/training-events";
import { getBusCorrelationId } from "@trading-model/http/correlation-id";
import {
	CorrelationId,
	InstanceId,
	ServiceId,
	Topic,
} from "@trading-model/primitives/primitives";
import type { MessageManager } from "../../config/message-manager";
import type { TradingSymbol } from "../../domain/market-data-types";
import type {
	ModelPublisherPort,
	StoredModelRef,
} from "../../domain/ports/model-publisher.port";
import type { BestAgentSummary } from "../../domain/training-state";

const TOPIC = Topic.of(TrainingEvent.ModelPublished);

interface PublishContext {
	trainerId: string;
	instanceId: string;
}

function buildMetadata(ctx: PublishContext): MessageMetadata {
	return new HELPER.metadataBuilder(TOPIC, TrainingEvent.ModelPublished, {
		instanceId: InstanceId.of(ctx.instanceId),
		serviceName: ServiceId.of(ctx.trainerId),
	})
		.setDelivery({
			mode: DeliveryMode.AtLeastOnce,
			requireSubscriber: true,
		})
		.setIds({
			causationId: CorrelationId.of(randomUUID()),
			correlationId: getBusCorrelationId() ?? CorrelationId.of(randomUUID()),
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
			admissible: stored.admissible,
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
