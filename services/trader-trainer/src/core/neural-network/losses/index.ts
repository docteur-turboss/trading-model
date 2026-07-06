import type { LossFunctionType } from "../type";
import { BinaryCrossEntropyLoss } from "./binary-cross-entropy";
import { CrossEntropyLoss } from "./cross-entropy";
import { HingeLoss } from "./hinge";
import { HuberLoss } from "./huber";
import { KLDivergenceLoss } from "./kl-divergence";
import { LogCoshLoss } from "./log-cosh";
import { MeanAbsoluteError } from "./mae";
import { MeanBiasError } from "./mean-bias";
import { MeanSquaredError } from "./mse";
import { RootMeanSquaredError } from "./rmse";

export type { LossDefinition } from "./loss-definition";

export const MEAN_SQUARED_ERROR = new MeanSquaredError();
export const MEAN_ABSOLUTE_ERROR = new MeanAbsoluteError();
export const ROOT_MEAN_SQUARED_ERROR = new RootMeanSquaredError();
export const MEAN_BIAS_ERROR = new MeanBiasError();
export const HUBER_LOSS = new HuberLoss();
export const LOG_COSH_LOSS = new LogCoshLoss();
export const CROSS_ENTROPY = new CrossEntropyLoss();
export const BINARY_CROSS_ENTROPY = new BinaryCrossEntropyLoss();
export const HINGE_LOSS = new HingeLoss();
export const KL_DIVERGENCE = new KLDivergenceLoss();

export const LOSSES: Record<LossFunctionType, import("./loss-definition").LossDefinition> = {
	"mean-squared-error": MEAN_SQUARED_ERROR,
	"mean-absolute-error": MEAN_ABSOLUTE_ERROR,
	"root-mean-squared-error": ROOT_MEAN_SQUARED_ERROR,
	"mean-biais-error": MEAN_BIAS_ERROR,
	"huber-loss": HUBER_LOSS,
	"log-cosh-loss": LOG_COSH_LOSS,
	"cross-entropy": CROSS_ENTROPY,
	"binary-cross-entropy": BINARY_CROSS_ENTROPY,
	"hinge-loss": HINGE_LOSS,
	"Kullback-Leibler-divergence": KL_DIVERGENCE,
};
