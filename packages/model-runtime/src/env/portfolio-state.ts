import type { Cash, Price, Volume } from "@trading-model/primitives/primitives";

export interface PortfolioState {
	cash: Cash;
	position: Volume;
	price: Price;
}
