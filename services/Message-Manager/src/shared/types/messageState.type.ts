export enum BusState {
    STOPPED = 'stopped',
    INITIALIZING = 'initializing',
    RUNNING = 'running',
    STOPPING = 'stopping'
}

export const ALLOWED_TRANSITIONS: Record<BusState, BusState[]> = {
    [BusState.STOPPED]: [BusState.INITIALIZING],
    [BusState.INITIALIZING]: [BusState.RUNNING, BusState.STOPPED],
    [BusState.RUNNING]: [BusState.STOPPING],
    [BusState.STOPPING]: [BusState.STOPPED]
}