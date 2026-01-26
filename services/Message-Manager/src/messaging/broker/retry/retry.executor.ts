import { RetryPolicy } from "./retry.policy";

export class RetryExecutor {
  async execute(
    handler: () => Promise<void>,
    policy: RetryPolicy
  ) {
    let attempt = 0;

    while (true) {
      try {
        await handler();
        return;
      } catch (e) {
        if (++attempt > policy.maxRetries) throw e;
        await new Promise(r => setTimeout(r, policy.delayMs));
      }
    }
  }
}