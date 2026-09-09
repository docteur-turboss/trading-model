import {
	Cash,
	type DecimalPrecision,
	type Price,
	type Volume,
} from "@trading-model/common/domain/primitives";

export function computeValuation(
	cash: Cash,
	position: Volume,
	price: Price,
	decimals: DecimalPrecision
): Cash {
	return Cash.round(
		Cash.add(cash, Cash.fromProduct(position, price)),
		decimals
	);
}

export function computePnL(
	valuation: Cash,
	initialCash: Cash,
	decimals: DecimalPrecision
): Cash {
	return Cash.round(Cash.sub(valuation, initialCash), decimals);
}
