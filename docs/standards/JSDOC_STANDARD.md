# JSDoc Standard

## Philosophy

JSDoc explains **why** and **what**, not **how**. The code itself is the how. TypeScript types already describe the shape of data — JSDoc should never duplicate type information.

## Do Document

| Category                            | When                                    | Example                                                             |
| ----------------------------------- | --------------------------------------- | ------------------------------------------------------------------- |
| **Exported functions / public API** | Always                                  | `/** Parse a JWT token and return its payload. */`                  |
| **Complex internal logic**          | When the algorithm isn't obvious        | `/** Uses bisect to find the insertion index in a sorted array. */` |
| **Non-trivial side effects**        | Always                                  | `/** Clears the cache and writes a tombstone file to disk. */`      |
| **Magic constants / numbers**       | Why that value                          | `/** 300000 = 5 min budget for GA training */`                      |
| **Error / throw conditions**        | When not obvious from types             | `@throws when the token has expired`                                |
| **Interfaces / types**              | 1-line purpose                          | `/** Paginated response wrapper */`                                 |
| **Classes**                         | Responsibility and lifetime             | `/** Manages WebSocket connections per service instance. */`        |
| **Deprecated items**                | Always                                  | `@deprecated use buildPingUrl()`                                    |
| **`@template` (generics)**          | When the type param meaning isn't clear | `@template T entity type`                                           |

## Don't Document

| Category                           | Reason                                           |
| ---------------------------------- | ------------------------------------------------ |
| Trivial getters / setters          | `getName()` → returns `name` is self-documenting |
| TypeScript types                   | Types already tell you `string`, `number`, etc.  |
| Obvious parameters                 | `name: string` doesn't need `/** The name */`    |
| Override methods that match parent | Only add if behaviour differs                    |
| Internal step-by-step              | The code is the algorithm                        |

## Format

```typescript
/**
 * Short sentence starting with a capital letter and ending with a period.
 * Second sentence if needed. No blank line before params.
 *
 * @param paramName - Description starting with lowercase (dash separator).
 * @returns Description starting with lowercase.
 * @throws Description of when this throws.
 */
```

### Rules

- **One line** if the description fits: `/** Parse a JWT and return the payload. */`
- **Verb form**: 3rd person singular present tense (Returns, Parses, Validates, Creates)
- **No `@param` type** — TypeScript already provides it
- **No `@returns` type** — TypeScript already provides it
- **Dash separator** between param name and description: `@param name - Description`
- **`@throws`** only for non-obvious cases (not for every possible Error)
- **No `@typedef`** — write actual TypeScript types
- **No `@type`** — TypeScript infers types
- **No `@example`** unless the usage is genuinely non-obvious

## Examples

### Good

```typescript
/** Fetch candle data from Binance for the given symbol and interval. */
export async function fetchCandles(symbol: string, interval: string): Promise<Candle[]> {
```

```typescript
/**
 * Register a service instance so it can be discovered by peers.
 * Sends a POST to the discovery-server with TTL-based lease.
 *
 * @param instance - Service metadata to register.
 * @returns The server response with assigned lease duration.
 * @throws If the discovery-server is unreachable after 3 retries.
 */
export async function register(instance: ServiceInstance): Promise<RegistrationResponse> {
```

```typescript
/**
 * Decay the learning rate over time using a cosine schedule.
 *
 * @param step - Current training step (0-indexed).
 * @param totalSteps - Total steps in the schedule.
 * @returns The decayed learning rate in [0, 1].
 */
export function cosineDecay(step: number, totalSteps: number): number {
```

### Bad

```typescript
/**
 * Add function
 * @param a - The first number
 * @param b - The second number
 * @returns The result
 */
export function add(a: number, b: number): number { return a + b; }
// Why: Obvious. The signature says everything.

/**
 * @param url - Url
 * @returns Promise with data
 */
export async function get<T>(url: string): Promise<T> { ... }
// Why: Params and return just repeat the types. No real description.
```

## Consistency

All files in this repository follow this standard. If you encounter code that doesn't, please update it.
