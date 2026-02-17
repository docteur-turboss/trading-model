import z from "zod";
import { OrderBookEntity } from "../market-data.types";

const aksBidsDef = z.object({
    quantity: z.number(),
    price: z.number()
})
const tableDef = z.object({
    symbol: z.string(),
    market: z.enum([
        "crypto", 
        "equity", 
        "bond", 
        "etf", 
        "fx", 
        "future"
    ]),
    source: z.string(),
    bids: z.array(aksBidsDef),
    asks: z.array(aksBidsDef),
    timestamp: z.date()
})

const MarkerOrderBooks = new class TMarketOrderBooks {
    private storage: Map<number, OrderBookEntity> = new Map();
    private marketStorage: Map<string, number[]> = new Map();
    private sourceStorage: Map<string, number[]> = new Map();
    private symbolStorage: Map<string, number[]> = new Map();
    private timestampStorage: Map<number, number[]> = new Map();
    private id: number = 10000;
    constructor() {}

    insertInto(data: OrderBookEntity[]) {
        if(!data.length) return;
        const saveBeforeUpdate = {
            storage: this.storage,
            marketStorage: this.marketStorage,
            sourceStorage: this.sourceStorage,
            symbolStorage: this.symbolStorage,
            timestampStorage: this.timestampStorage,
            id: this.id
        };

        try{
            for(let d of data){
                tableDef.parse(d);

                this.storage.set(this.id, d);
                if(this.marketStorage.has(d.market)){
                    let actualStorage = this.marketStorage.get(d.market)!;
                    actualStorage.push(this.id);

                    this.marketStorage.set(d.market, actualStorage);
                } else this.marketStorage.set(d.market, [this.id]); 

                if(this.sourceStorage.has(d.source)){
                    let actualStorage = this.sourceStorage.get(d.market)!;
                    actualStorage.push(this.id);

                    this.sourceStorage.set(d.source, actualStorage);
                } else this.sourceStorage.set(d.market, [this.id]);

                if(this.symbolStorage.has(d.source)){
                    let actualStorage = this.symbolStorage.get(d.market)!;
                    actualStorage.push(this.id);

                    this.symbolStorage.set(d.source, actualStorage);
                } else this.symbolStorage.set(d.market, [this.id]);

                if(this.timestampStorage.has(d.timestamp)){
                    let actualStorage = this.timestampStorage.get(d.timestamp)!;
                    actualStorage.push(this.id);

                    this.timestampStorage.set(d.timestamp, actualStorage);
                } else this.timestampStorage.set(d.timestamp, [this.id]);

                this.id++;
            }
        }catch(e){
            this.id = saveBeforeUpdate.id;
            this.storage = saveBeforeUpdate.storage;
            this.marketStorage = saveBeforeUpdate.marketStorage;
            this.sourceStorage = saveBeforeUpdate.sourceStorage;
            this.symbolStorage = saveBeforeUpdate.symbolStorage;
            this.timestampStorage = saveBeforeUpdate.timestampStorage;

            throw e;
        }
        return this;
    }

    getById(id: number){
        if(!this.storage.has(id)) return null;
        return this.storage.get(id);
    }

    getBySymbol(symbol: string){
        if(!this.symbolStorage.has(symbol)) return null;
        const symbols = this.symbolStorage.get(symbol)!;
        return symbols.map(d => this.storage.get(d));
    }

    getByMarket(market: string){
        if(!this.marketStorage.has(market)) return null;
        const markets = this.marketStorage.get(market)!;
        return markets.map(d => this.storage.get(d));
    }

    getBySource(source: string){
        if(!this.sourceStorage.has(source)) return null;
        const sources = this.sourceStorage.get(source)!;
        return sources.map(d => this.storage.get(d));
    }

    getAfterTimestamp(timestamp: number){
        const result = [];

        for (const [ts, ids] of this.timestampStorage.entries()) {
            if (ts > timestamp) for (const id of ids) result.push(this.storage.get(id)!);
        }

        return result.sort((a, b) => a.timestamp - b.timestamp);
    }

    getBeforeTimestamp(timestamp: number){
        const result = []

        for (const [ts, ids] of this.timestampStorage.entries()) {
            if(ts < timestamp) for (const id of ids) result.push(this.storage.get(id)!);
        }

        return result.sort((a, b) => a.timestamp - b.timestamp);
    }

}

export const insertOrderBook = async (data: OrderBookEntity[]): Promise<void> => {
    if (!data.length) return;

    MarkerOrderBooks.insertInto(data);
}


export const selectOrderBookBy = {
    symbol: async (symbol: string) => {
        return MarkerOrderBooks.getBySymbol(symbol);
    },
    timestamp: {
        after : async (timestamp: number) => {
            return MarkerOrderBooks.getAfterTimestamp(timestamp);
        },
        before : async (timestamp: number) => {
            return MarkerOrderBooks.getBeforeTimestamp(timestamp);
        }
    },
    source: async (source: string) => {
        return MarkerOrderBooks.getBySource(source);
    }
}