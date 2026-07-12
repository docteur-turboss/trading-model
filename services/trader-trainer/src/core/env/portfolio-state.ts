import type {
	Cash,
	DecimalPrecision,
	Price,
	Volume,
} from "@trading-model/common/domain/primitives";

export interface PortfolioState {
	cash: Cash;
	position: Volume;
	price: Price;
}

export interface ValuationConfig {
	initialCash: Cash;
	decimals: DecimalPrecision;
}
