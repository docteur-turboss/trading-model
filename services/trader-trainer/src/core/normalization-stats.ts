/** Online running mean and standard deviation for z-score normalisation. */
export class NormalizationStats {
  private count = 0;
  private mean = 0;
  private m2 = 0;

  /** Incorporate a new observation and update running statistics. */
  update(value: number): void {
    this.count++;
    const delta = value - this.mean;
    this.mean += delta / this.count;
    const delta2 = value - this.mean;
    this.m2 += delta * delta2;
  }

  getMean(): number {
    return this.mean;
  }

  get mu(): number {
    return this.mean;
  }

  getStd(): number {
    if (this.count < 2) return 0;
    return Math.sqrt(this.m2 / (this.count - 1));
  }

  get std(): number {
    return this.getStd();
  }

  /** Normalise `value` to z-score using current running statistics. */
  normalize(value: number): number {
    const std = this.getStd();
    if (std < 1e-10) return 0;
    return (value - this.mean) / std;
  }

  /** Serialize internal state for checkpointing. */
  toJSON(): { count: number; mean: number; m2: number } {
    return { count: this.count, mean: this.mean, m2: this.m2 };
  }

  /** Deserialize and create a NormalizationStats from a saved snapshot. */
  static fromJSON(data: { count: number; mean: number; m2: number }): NormalizationStats {
    const ns = new NormalizationStats();
    ns.count = data.count;
    ns.mean = data.mean;
    ns.m2 = data.m2;
    return ns;
  }
}
