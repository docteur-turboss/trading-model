type WalletAPI = {
    buy: (amount: number) => boolean;
    sell: (amount: number) => boolean;
    setPrice: (newPrice: number) => void;
    getPosition: () => number;
    getCash: () => number;
    getValuation: () => number;
    getPrice: () => number;
};

/**
 * Create a simulated financial portfolio that allows you to buy, sell, and track valuations.
 *
 * @function Wallet
 * @param {Object} param
 * @param {number} param.initialCash - Initial amount of cash in the portfolio
 * @param {number} param.initialPrice - Current price of an asset at the time the portfolio was created
 * @returns {object} Object representing the portfolio with several management methods
 *
 * @example
 * const wallet = createWallet({initialCash: 1000, initialPrice: 50});
 *
 * wallet.buy(5);           // true
 * wallet.sell(2);          // true
 * wallet.setPrice(60);
 * 
 * console.log(wallet.getCash());        // 1000 - (5 * 50) + (2 * 60) = 920
 * console.log(wallet.getPosition());    // 3
 * console.log(wallet.getValuation());   // 920 + (3 * 60) = 1100

 */
export const createWallet = ({initialCash, initialPrice} : {initialCash: number, initialPrice: number}): WalletAPI => {
    if (!Number.isFinite(initialCash) || initialCash < 0)
        throw new Error("Invalid initial cash amount.");
    if (!Number.isFinite(initialPrice) || initialPrice <= 0)
        throw new Error("Invalid initial price.");

    let price = initialPrice;
    let cash = initialCash;
    let position = 0;

    /**
     * Buy a certain number of units of the asset at the current price
     * 
     * @function buy
     * @param {number} amount - Amount of assets to be purchased
     * @returns {boolean} Return `true` if succeed, `false` otherwise
     */
    const buy = (amount: number): boolean => {
        if (amount <= 0) return false;
        const cost = amount * price;
        if (cost > cash) return false;

        position += amount;
        cash -= cost;
        return true;
    };

    /**
     * Sell a certain number of units of the asset at the current price
     * 
     * @function sell
     * @param {number} amount - Amount of assets for sale
     * @returns {boolean} Return `true` if succeed, `false` otherwise
     */
    const sell = (amount: number): boolean => {
        if (amount <= 0 || amount > position) return false;

        position -= amount;
        cash += amount * price;
        return true;
    };

    /**
     * Updates the current price of the asset
     *
     * @function SetPrice
     * @param {number} newPrice - New price of the asset
     * @returns {void}
     */
    const setPrice = (newPrice: number): void => {
        if (Number.isFinite(newPrice) && newPrice > 0) price = newPrice;
    };

    /**
     * Retrieves the current position (number of units held)
     *
     * @function GetPosition
     * @returns {number} Number of units held
     */
    const getPosition = (): number => position;
    /**
     * Recovers the total available liquidity (remaining cash).
     *
     * @function getCash
     * @returns {number} Amount of cash available
     */
    const getCash = (): number => cash;
    /**
     * Calculates the total valuation of the portfolio (position * price + cash)
     *
     * @function getValuation
     * @returns {number} Total value of the wallet
     */
    const getValuation = (): number => cash + position * price;
    /**
     * Retrieves the current price of the asset
     *
     * @function getPrice
     * @returns {number} Current price of the asset
     */
    const getPrice = (): number => price;

    return {
        buy,
        sell,
        setPrice,
        getPosition,
        getCash,
        getValuation,
        getPrice,
    };
};