/**
 * Custom broker client
 * Replace with real implementation.
 */
export interface BrokerClientType {
    // readonly name: string
    connect(): Promise<void>
    disconnect(): Promise<void>
    isHealthy(): boolean
}