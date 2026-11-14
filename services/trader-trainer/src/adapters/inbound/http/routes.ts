import { HTTP_STATUS } from "@trading-model/contracts/http-status";
import { mountRoute } from "@trading-model/http/adapters/inbound/api-route/mount-route";
import { sendResponse } from "@trading-model/http/adapters/inbound/response-exception";
import { toJsonWire } from "@trading-model/http/infrastructure/json-wire";
import { Router } from "express";
import type { Trainer } from "../../../application/trainer";
import type { ModelArtifactStorePort } from "../../../domain/ports/model-artifact-store.port";
import { TRAINER_API } from "./api-routes";
import {
	type CallerResolver,
	MODEL_DOWNLOAD_GUARD,
} from "./model-download-guard";

/** 200 `{ data }`; `toJsonWire` keeps Sets as arrays. */
function ok(data: unknown) {
	return sendResponse(JSON.stringify({ data }, toJsonWire), HTTP_STATUS.OK);
}

function notFound(error: string) {
	return sendResponse({ error }, HTTP_STATUS.NOT_FOUND);
}

export interface TrainerRoutesOptions {
	models: ModelArtifactStorePort;
	/** `MODEL_DOWNLOAD_CALLERS`: services allowed to download weights. */
	downloadCallers: readonly string[];
	/** Caller identity (mTLS by default; replaced in tests). */
	resolveCaller?: CallerResolver;
}

/** Read routes of the trainer (TRAINER_API). */
export const TRAINER_ROUTES = (
	trainer: Trainer,
	{ models, downloadCallers, resolveCaller }: TrainerRoutesOptions
): Router => {
	const router = Router();

	mountRoute(router, TRAINER_API.bestAgent, () => {
		const agent = trainer.getBestAgentSummary();
		if (!agent) {
			return notFound("No trained agent available at the moment.");
		}
		return ok({
			agent,
			training: trainer.isTraining(),
			symbol: trainer.getCurrentSymbol(),
			generation: trainer.getGeneration(),
		});
	});

	mountRoute(router, TRAINER_API.trainingStatus, () =>
		ok({
			training: trainer.isTraining(),
			symbol: trainer.getCurrentSymbol(),
			generation: trainer.getGeneration(),
		})
	);

	mountRoute(router, TRAINER_API.trainingAgents, () => {
		const agents = [];
		for (const [symbol, snapshot] of trainer.getAllSnapshots()) {
			const agent = snapshot.buildBestAgentSummary();
			if (agent) {
				agents.push({
					symbol: String(symbol),
					agent,
					training:
						trainer.isTraining() && trainer.getCurrentSymbol() === symbol,
					generation: snapshot.generation,
				});
			}
		}
		return ok({
			agents,
			training: trainer.isTraining(),
			currentSymbol: trainer.getCurrentSymbol(),
		});
	});

	mountRoute(
		router,
		TRAINER_API.trainingAgent,
		async ({ params: { symbol } }) => {
			const snapshot = trainer.getSnapshotForSymbol(symbol);
			if (!snapshot) {
				return notFound(`No trained agent for symbol ${symbol}.`);
			}
			const agent = snapshot.buildBestAgentSummary();
			if (!agent) {
				return notFound("No trained agent available at the moment.");
			}
			return ok({
				symbol,
				agent,
				training: trainer.isTraining() && trainer.getCurrentSymbol() === symbol,
				generation: snapshot.generation,
				model: (await models.latest(String(symbol))) ?? null,
			});
		}
	);

	mountRoute(router, TRAINER_API.listModels, async ({ params }) =>
		ok(await models.list(params.symbol))
	);

	mountRoute(router, TRAINER_API.getModel, async ({ params }) => {
		const manifest = await models.manifest(params.symbol, params.version);
		return manifest ? ok(manifest) : notFound("No such model version.");
	});

	mountRoute(
		router,
		TRAINER_API.getModelWeights,
		async ({ params }) => {
			const manifest = await models.manifest(params.symbol, params.version);
			const weights =
				manifest && (await models.weights(params.symbol, params.version));
			if (!(manifest && weights)) {
				return notFound("No such model version.");
			}
			return {
				status: HTTP_STATUS.OK,
				data: Buffer.from(weights),
				contentType: "application/octet-stream",
				headers: { "x-model-sha256": manifest.weights.sha256 },
			};
		},
		{ middlewares: [MODEL_DOWNLOAD_GUARD(downloadCallers, resolveCaller)] }
	);

	return router;
};
