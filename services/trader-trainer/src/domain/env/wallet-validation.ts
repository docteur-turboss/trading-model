import type {
	DecimalPrecision,
	Percentage,
	Price,
} from "@trading-model/primitives/primitives";
import type { WalletConfigParams } from "./wallet-config";

function _validateInitialPrice(initialPrice: Price): void {
	if (!Number.isFinite(initialPrice) || initialPrice <= 0) {
		throw new Error(`Invalid initialPrice: ${initialPrice}`);
	}
}

function _validateRate(name: string, rate: Percentage): void {
	if (!Number.isFinite(rate) || rate < 0 || rate >= 1) {
		throw new Error(`Invalid ${name}: ${rate}. Must be in [0, 1[`);
	}
}

function _validateMaxExposureFraction(fraction: number): void {
	if (!Number.isFinite(fraction) || fraction <= 0) {
		throw new Error(`Invalid maxExposureFraction: ${fraction}`);
	}
}

function _validateDecimals(decimals: DecimalPrecision): void {
	if (!Number.isInteger(decimals) || decimals < 1 || decimals > 15) {
		throw new Error(
			`Invalid decimals: ${decimals}. Must be an integer in [1, 15]`
		);
	}
}

export function validateConfig(config: Required<WalletConfigParams>): void {
	_validateInitialPrice(config.initialPrice);
	_validateRate("feeRate", config.feeRate);
	_validateRate("executionCostRate", config.executionCostRate);
	_validateMaxExposureFraction(config.maxExposureFraction);
	_validateDecimals(config.decimals);
}
