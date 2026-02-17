import z from "zod";
import { catchSync } from "cash-lib/middleware/catchError";
import { selectTradesBy } from "infra/market-data/schema/trades.schema";
import { ResponseException } from "cash-lib/middleware/responseException";
import { selectTickerBy } from "infra/market-data/schema/ticker24h.schema";
import { selectOrderBookBy } from "infra/market-data/schema/orderBook.schema";

/* -------------------------------------------------------------------------- */
/*                                   Schemas                                  */
/* -------------------------------------------------------------------------- */
const symbolSchema = z.object({
    symbol: z.string("Symbol is required and must be a string.").min(1)
});

const sourceSchema = z.object({
    source: z.string("Source is required and must be a string.").min(1)
});

const timestampSchema = z.object({
    timestamp: z.coerce.date("Timestamp must be a valid date or a parsable date string.")
});

const orderBookTimestampSchema = z.object({
    timestamp: z.coerce.number("Timestamp must be a valid numeric value.")
});

/* -------------------------------------------------------------------------- */
/*                                Trades routes                               */
/* -------------------------------------------------------------------------- */

export const GetTradeBySymbolController = catchSync(async (req) => {
    const parsed = symbolSchema.safeParse(req.params);
    if(!parsed.success) throw ResponseException(parsed.error.message).BadRequest();

    try{
        throw ResponseException(
            JSON.stringify(await selectTradesBy.symbol(parsed.data.symbol))
        ).Success();
    }catch(e) {
        if(e instanceof Error && e.message.includes("No result returned")) throw ResponseException("No data found").NotFound();
        throw e;
    }
});

export const GetTradeByTimestampController = catchSync(async (req) => {
    const parsed = timestampSchema.safeParse(req.params);
    if(!parsed.success) throw ResponseException(parsed.error.message).BadRequest();

    
    try{
        throw ResponseException(
            JSON.stringify(await selectTradesBy.timestamp(parsed.data.timestamp))
        ).Success();
    }catch(e) {
        if(e instanceof Error && e.message.includes("No result returned")) throw ResponseException("No data found").NotFound();
        throw e;
    }
});

export const GetTradeBySourceController = catchSync(async (req) => {
    const parsed = sourceSchema.safeParse(req.params);
    if(!parsed.success) throw ResponseException(parsed.error.message).BadRequest();

    
    try{
        throw ResponseException(
            JSON.stringify(await selectTradesBy.source(parsed.data.source))
        ).Success();
    }catch(e) {
        if(e instanceof Error && e.message.includes("No result returned")) throw ResponseException("No data found").NotFound();
        throw e;
    }
});

/* -------------------------------------------------------------------------- */
/*                                Ticker routes                               */
/* -------------------------------------------------------------------------- */

export const GetTickerBySymbolController = catchSync(async (req) => {
    const parsed = symbolSchema.safeParse(req.params);
    if(!parsed.success) throw ResponseException(parsed.error.message).BadRequest();

    try{
        throw ResponseException(
            JSON.stringify(await selectTickerBy.symbol(parsed.data.symbol))
        ).Success();
    }catch(e) {
        if(e instanceof Error && e.message.includes("No result returned")) throw ResponseException("No data found").NotFound();
        throw e;
    }
});

export const GetTickerByTimestampController = catchSync(async (req) => {
    const parsed = timestampSchema.safeParse(req.params);
    if(!parsed.success) throw ResponseException(parsed.error.message).BadRequest();

    
    try{
        throw ResponseException(
            JSON.stringify(await selectTickerBy.timestamp(parsed.data.timestamp))
        ).Success();
    }catch(e) {
        if(e instanceof Error && e.message.includes("No result returned")) throw ResponseException("No data found").NotFound();
        throw e;
    }
});

export const GetTickerBySourceController = catchSync(async (req) => {
    const parsed = sourceSchema.safeParse(req.params);
    if(!parsed.success) throw ResponseException(parsed.error.message).BadRequest();

    
    try{
        throw ResponseException(
            JSON.stringify(await selectTickerBy.source(parsed.data.source))
        ).Success();
    }catch(e) {
        if(e instanceof Error && e.message.includes("No result returned")) throw ResponseException("No data found").NotFound();
        throw e;
    }
});

/* -------------------------------------------------------------------------- */
/*                             OrderBook routes                               */
/* -------------------------------------------------------------------------- */

export const GetOrderBookBySymbolController = catchSync(async (req) => {
    const parsed = symbolSchema.safeParse(req.params);
    if(!parsed.success) throw ResponseException(parsed.error.message).BadRequest();

    try{
        throw ResponseException(
            JSON.stringify(await selectOrderBookBy.symbol(parsed.data.symbol))
        ).Success();
    }catch(e) {
        if(e instanceof Error && e.message.includes("No result returned")) throw ResponseException("No data found").NotFound();
        throw e;
    }
});

export const GetOrderBookByTimestampAfterController = catchSync(async (req) => {
    const parsed = orderBookTimestampSchema.safeParse(req.params);
    if(!parsed.success) throw ResponseException(parsed.error.message).BadRequest();

    
    try{
        throw ResponseException(
            JSON.stringify(await selectOrderBookBy.timestamp.after(parsed.data.timestamp))
        ).Success();
    }catch(e) {
        if(e instanceof Error && e.message.includes("No result returned")) throw ResponseException("No data found").NotFound();
        throw e;
    }
});

export const GetOrderBookByTimestampBeforeController = catchSync(async (req) => {
    const parsed = orderBookTimestampSchema.safeParse(req.params);
    if(!parsed.success) throw ResponseException(parsed.error.message).BadRequest();

    
    try{
        throw ResponseException(
            JSON.stringify(await selectOrderBookBy.timestamp.before(parsed.data.timestamp))
        ).Success();
    }catch(e) {
        if(e instanceof Error && e.message.includes("No result returned")) throw ResponseException("No data found").NotFound();
        throw e;
    }
});

export const GetOrderBookBySourceController = catchSync(async (req) => {
    const parsed = sourceSchema.safeParse(req.params);
    if(!parsed.success) throw ResponseException(parsed.error.message).BadRequest();

    
    try{
        throw ResponseException(
            JSON.stringify(await selectOrderBookBy.source(parsed.data.source))
        ).Success();
    }catch(e) {
        if(e instanceof Error && e.message.includes("No result returned")) throw ResponseException("No data found").NotFound();
        throw e;
    }
});

/* -------------------------------------------------------------------------- */
/*                               Candles routes                               */
/* -------------------------------------------------------------------------- */

export const GetCandlesBySymbolController = catchSync(async (req) => {
    const parsed = symbolSchema.safeParse(req.params);
    if(!parsed.success) throw ResponseException(parsed.error.message).BadRequest();

    try{
        throw ResponseException(
            JSON.stringify(await selectOrderBookBy.symbol(parsed.data.symbol))
        ).Success();
    }catch(e) {
        if(e instanceof Error && e.message.includes("No result returned")) throw ResponseException("No data found").NotFound();
        throw e;
    }
});

export const GetCandlesByTimestampController = catchSync(async (req) => {
    const parsed = timestampSchema.safeParse(req.params);
    if(!parsed.success) throw ResponseException(parsed.error.message).BadRequest();
    
    try{
        throw ResponseException(
            JSON.stringify(await selectOrderBookBy.timestamp.after(parsed.data.timestamp.getTime()))
        ).Success();
    }catch(e) {
        if(e instanceof Error && e.message.includes("No result returned")) throw ResponseException("No data found").NotFound();
        throw e;
    }
});

export const GetCandlesBySourceController = catchSync(async (req) => {
    const parsed = sourceSchema.safeParse(req.params);
    if(!parsed.success) throw ResponseException(parsed.error.message).BadRequest();
    
    try{
        throw ResponseException(
            JSON.stringify(await selectOrderBookBy.source(parsed.data.source))
        ).Success();
    }catch(e) {
        if(e instanceof Error && e.message.includes("No result returned")) throw ResponseException("No data found").NotFound();
        throw e;
    }
});