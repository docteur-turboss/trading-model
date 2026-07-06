import { Cash, Percentage, Price, Volume } from "@trading-model/common/domain/primitives";
import type { WalletConfig } from "./wallet-manager";

function _validateInitialCash(initialCash: Cash): void {
	if (!Number.isFinite(+initialCash) || +initialCash < 0) {
		throw new Error(`Invalid initialCash: ${initialCash}`);
	}
}

function _validateInitialPrice(initialPrice: Price): void {
	if (!Number.isFinite(+initialPrice) || +initialPrice <= 0) {
		throw new Error(`Invalid initialPrice: ${initialPrice}`);
	}
}

function _validateFeeRate(feeRate: Percentage): void {
	if (!Number.isFinite(+feeRate) || +feeRate < 0 || +feeRate >= 1) {
		throw new Error(`Invalid feeRate: ${feeRate}. Must be in [0, 1[`);
	}
}

function _validateMaxPosition(maxPosition: Volume): void {
	if (+maxPosition <= 0) {
		throw new Error(`Invalid maxPosition: ${maxPosition}`);
	}
}

function _validateDecimals(decimals: number): void {
	if (!Number.isInteger(decimals) || decimals < 1 || decimals > 15) {
		throw new Error(
			`Invalid decimals: ${decimals}. Must be an integer in [1, 15]`
		);
	}
}

export function validateConfig(config: Required<WalletConfig>): void {
	_validateInitialCash(config.initialCash);
	_validateInitialPrice(config.initialPrice);
	_validateFeeRate(config.feeRate);
	_validateMaxPosition(config.maxPosition);
	_validateDecimals(config.decimals);
}
