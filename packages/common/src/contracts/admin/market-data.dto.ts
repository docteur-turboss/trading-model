export interface Candle {
	timestamp: string;
	open: number;
	high: number;
	low: number;
	close: number;
	volume: number;
}

export interface Ticker {
	symbol: string;
	price: number;
	change24h: number;
	high24h: number;
	low24h: number;
	volume24h: number;
}
