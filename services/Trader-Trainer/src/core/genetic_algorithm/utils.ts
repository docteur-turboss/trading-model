export function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export function generateId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export class RunningStats {
  private n = 0;
  private mean = 0;
  private M2   = 0;

  update(x: number): void {
    this.n++;
    const delta = x - this.mean;
    this.mean += delta / this.n;
    this.M2 += delta * (x - this.mean);
  }

  get std() { return this.n < 2 ? 1 : Math.sqrt(this.M2 / (this.n - 1)); }
  get mu()  { return this.mean; }
  normalize(x: number) { return (x - this.mu) / (this.std + 1e-8); }
}

export function computeVariance(scores: number[]): number {
  if (scores.length < 2) return 0;
  const mean = scores.reduce((s, v) => s + v, 0) / scores.length;
  return scores.reduce((s, v) => s + (v - mean) ** 2, 0) / (scores.length - 1);
}

export function computeSharpe(scores: number[]): number {
  if (scores.length < 2) return 0;
  const mean = scores.reduce((s, v) => s + v, 0) / scores.length;
  const std  = Math.sqrt(computeVariance(scores));
  return std < 1e-8 ? 0 : mean / std;
}
