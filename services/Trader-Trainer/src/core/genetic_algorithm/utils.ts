// ================================================================
//                    shared primitives
// ================================================================
 
export function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
 
export function generateId(): string {
  return Math.random().toString(36).slice(2, 10);
}