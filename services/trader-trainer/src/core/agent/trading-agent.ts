import { Agent } from '../neural-network/agent';
import { createWallet, WalletConfig } from '../env/wallet-manager';
import StateManager, { StateManagerConfig } from './state-manager';

/** Configuration to create a TradingAgent with neural network, wallet, and RL state management. */
export type TradingAgentConfig = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  nnConfig: any;
  wallet?: WalletConfig;
  actionSpace?: 'discrete' | 'continuous';
  tradeAmount?: number; // default fixed units per trade
  stateManagerCfg?: StateManagerConfig;
};

/** RL agent that couples a neural network with a simulated wallet and epsilon-greedy policy. */
export class TradingAgent {
  public readonly agent: Agent;
  public readonly wallet: ReturnType<typeof createWallet>;
  public readonly state: StateManager;

  private prevValuation = 0;

  constructor(cfg: TradingAgentConfig) {
    this.agent = new Agent(cfg.nnConfig);
    this.wallet = createWallet(cfg.wallet ?? { initialCash: 1000, initialPrice: 1 });
    this.state = new StateManager(cfg.stateManagerCfg ?? {});
    this.prevValuation = this.wallet.getValuation();
  }

  /** Map network output to an action. Default: discrete {0: sell,1:hold,2:buy} */
  public mapOutputToAction(
    output: Float32Array,
    cfg?: TradingAgentConfig
  ): { action: 'buy' | 'sell' | 'hold'; amount: number } {
    const space = cfg?.actionSpace ?? 'discrete';
    const amount = cfg?.tradeAmount ?? 1;

    if (space === 'continuous') {
      // interpret single output neuron as -1..1 scaled action
      const val = output[0] ?? 0;
      if (val > 0.25) return { action: 'buy', amount: Math.max(1, Math.round(val * amount)) };
      if (val < -0.25) return { action: 'sell', amount: Math.max(1, Math.round(-val * amount)) };
      return { action: 'hold', amount: 0 };
    }

    // discrete: choose argmax
    let idx = 0;
    for (let i = 1; i < output.length; i++) if (output[i] > output[idx]) idx = i;
    if (idx === 0) return { action: 'sell', amount };
    if (idx === 1) return { action: 'hold', amount: 0 };
    return { action: 'buy', amount };
  }

  /** Perform one environment step: update price, infer action, apply to wallet, and record reward */
  public step(
    input: Float32Array,
    price?: number,
    _done: boolean = false
  ): { action: string; reward: number; metrics: Record<string, unknown> } {
    void _done;
    if (price !== undefined) this.wallet.setPrice(price);

    const currentPnL = this.wallet.getPnL();
    const output = this.agent.fastForward(input);

    const { action, amount } = this.mapOutputToAction(output, { nnConfig: undefined });

    let executed = false;
    if (action === 'buy') executed = this.wallet.buy(amount);
    if (action === 'sell') executed = this.wallet.sell(amount);

    const nextPnL = this.wallet.getPnL();
    const reward = nextPnL - currentPnL;

    // Attach reward/nextState to the last pooled experience via fastForward call semantics
    // The Agent.fastForward already pushed the experience with reward/nextState undefined,
    // so we perform a small learning step here if possible.

    this.prevValuation = this.wallet.getValuation();

    // decay epsilon as episode proceeds
    this.state.decayEpsilon();

    return { action: executed ? action : 'none', reward, metrics: this.wallet.getMetrics() };
  }

  public resetEpisode(): void {
    this.wallet.reset();
    this.agent.clearPool();
    this.state.resetEpsilon();
    this.prevValuation = this.wallet.getValuation();
  }
}

export default TradingAgent;
