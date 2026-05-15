export type WalletConfig = {
    initialCash: number;
    initialPrice: number;
    /** Fee rate applied on each transaction (e.g. 0.001 = 0.1%). Default: 0 */
    feeRate?: number;
    /** Max units holdable (position cap). Default: Infinity */
    maxPosition?: number;
};

export type TradeRecord = {
    step: number;
    action: "buy" | "sell";
    amount: number;
    price: number;
    fee: number;
    cashAfter: number;
    positionAfter: number;
};

export type WalletMetrics = {
    pnl: number;
    returnRate: number;
    peakValuation: number;
    drawdown: number;
    totalFeesPaid: number;
    tradeCount: number;
};

type WalletAPI = {
    // --- Core trading actions ---
    buy: (amount: number) => boolean;
    sell: (amount: number) => boolean;
    setPrice: (newPrice: number) => void;

    // --- State accessors ---
    getPosition: () => number;
    getCash: () => number;
    getValuation: () => number;
    getPrice: () => number;

    // --- RL-specific ---
    getPnL: () => number;
    getMetrics: () => WalletMetrics;
    getHistory: () => Readonly<TradeRecord[]>;

    /** Reset wallet to initial state (call between episodes) */
    reset: () => void;
};

const round = (value: number, decimals = 8): number =>
    Math.round(value * 10 ** decimals) / 10 ** decimals;

/**
 * Create a simulated financial portfolio for RL/genetic algorithm trading.
 *
 * @example
 * const wallet = createWallet({ initialCash: 1000, initialPrice: 50, feeRate: 0.001 });
 *
 * wallet.buy(5);        // true  — costs 5 * 50 * (1 + 0.001) = 250.25
 * wallet.sell(2);       // true
 * wallet.setPrice(60);
 *
 * console.log(wallet.getPnL());       // valuation - initialCash
 * console.log(wallet.getMetrics());   // { pnl, returnRate, drawdown, ... }
 *
 * wallet.reset();       // back to initial state, ready for next episode
 */
export const createWallet = ({
    initialCash,
    initialPrice,
    feeRate = 0,
    maxPosition = Infinity,
}: WalletConfig): WalletAPI => {
    // --- Init validation ---
    if (!Number.isFinite(initialCash) || initialCash < 0)
        throw new Error(`Invalid initialCash: ${initialCash}`);
    if (!Number.isFinite(initialPrice) || initialPrice <= 0)
        throw new Error(`Invalid initialPrice: ${initialPrice}`);
    if (!Number.isFinite(feeRate) || feeRate < 0 || feeRate >= 1)
        throw new Error(`Invalid feeRate: ${feeRate}. Must be in [0, 1[`);
    if (maxPosition <= 0)
        throw new Error(`Invalid maxPosition: ${maxPosition}`);

    // --- Mutable state ---
    let price = initialPrice;
    let cash = initialCash;
    let position = 0;

    // --- Metrics tracking ---
    let peakValuation = initialCash;
    let totalFeesPaid = 0;
    let tradeCount = 0;
    let step = 0;
    const history: TradeRecord[] = [];

    // --- Helpers ---
    const currentValuation = () => round(cash + position * price);

    const updatePeak = () => {
        const val = currentValuation();
        if (val > peakValuation) peakValuation = val;
    };

    // --- Core actions ---

    /**
     * Buy a certain number of units at the current price (fees included).
     * Returns false if: invalid amount, insufficient cash, or position cap reached.
     */
    const buy = (amount: number): boolean => {
        if (!Number.isFinite(amount) || amount <= 0) return false;

        const newPosition = round(position + amount);
        if (newPosition > maxPosition) return false;

        const baseCost = round(amount * price);
        const fee = round(baseCost * feeRate);
        const totalCost = round(baseCost + fee);

        if (totalCost > cash) return false;

        position = newPosition;
        cash = round(cash - totalCost);
        totalFeesPaid = round(totalFeesPaid + fee);
        tradeCount++;
        updatePeak();

        history.push({ step, action: "buy", amount, price, fee, cashAfter: cash, positionAfter: position });
        return true;
    };

    /**
     * Sell a certain number of units at the current price (fees deducted from proceeds).
     * Returns false if: invalid amount or insufficient position.
     */
    const sell = (amount: number): boolean => {
        if (!Number.isFinite(amount) || amount <= 0 || amount > position) return false;

        const baseProceeds = round(amount * price);
        const fee = round(baseProceeds * feeRate);
        const netProceeds = round(baseProceeds - fee);

        position = round(position - amount);
        cash = round(cash + netProceeds);
        totalFeesPaid = round(totalFeesPaid + fee);
        tradeCount++;
        updatePeak();

        history.push({ step, action: "sell", amount, price, fee, cashAfter: cash, positionAfter: position });
        return true;
    };    
    
    /**
     * Update the asset price. Call this at each env step with the new market data.
     * Throws on invalid price to surface data pipeline issues early.
     */
    const setPrice = (newPrice: number): void => {
        if (!Number.isFinite(newPrice) || newPrice <= 0)
            throw new Error(`setPrice received invalid value: ${newPrice}`);
        price = newPrice;
        step++;
        updatePeak();
    };

    // --- Accessors ---
    const getPosition = (): number => position;
    const getCash = (): number => cash;
    const getValuation = (): number => currentValuation();
    const getPrice = (): number => price;

    /** Net profit/loss vs initial cash */
    const getPnL = (): number => round(currentValuation() - initialCash);

    /** Consolidated metrics — useful as RL observation features or episode summary */
    const getMetrics = (): WalletMetrics => {
        const valuation = currentValuation();
        return {
            pnl: round(valuation - initialCash),
            returnRate: round((valuation - initialCash) / initialCash),
            peakValuation,
            /** Max % drop from peak — key risk metric */
            drawdown: peakValuation > 0
                ? round((peakValuation - valuation) / peakValuation)
                : 0,
            totalFeesPaid,
            tradeCount,
        };
    };

    /** Full trade log for replay/debugging */
    const getHistory = (): Readonly<TradeRecord[]> => history;

    /** Reset to initial state — call between RL episodes */
    const reset = (): void => {
        price = initialPrice;
        cash = initialCash;
        position = 0;
        peakValuation = initialCash;
        totalFeesPaid = 0;
        tradeCount = 0;
        step = 0;
        history.length = 0;
    };

    return {
        buy,
        sell,
        setPrice,
        getPosition,
        getCash,
        getValuation,
        getPrice,
        getPnL,
        getMetrics,
        getHistory,
        reset,
    };
};