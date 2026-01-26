import { TimeoutError } from "shared/utils/timeoutError"

/**
 * Utility: Promise timeout wrapper
 */
export async function withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    context: string
): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => {
            reject(new TimeoutError(`${context} (${timeoutMs}ms)`))
        }, timeoutMs)

        promise
            .then(resolve)
            .catch(reject)
            .finally(() => clearTimeout(timer))
    })
}