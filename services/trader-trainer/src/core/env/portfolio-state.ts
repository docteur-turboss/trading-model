import type {
	Cash,
	Price,
	Volume,
} from "@trading-model/common/domain/primitives";

export interface PortfolioState {
	cash: Cash;
	position: Volume;
	price: Price;
}
