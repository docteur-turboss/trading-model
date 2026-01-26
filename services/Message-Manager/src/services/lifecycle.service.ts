export class Lifecycle<State extends string> {
  constructor(
    private state: State,
    private readonly transitions: Record<State, State[]>
  ) {}

  get current() {
    return this.state
  }

  transition(next: State) {
    if (!this.transitions[this.state]?.includes(next)) {
      throw new Error(`Invalid transition: ${this.state} → ${next}`)
    }
    this.state = next
  }

  /**
   * Attempt a transition without throwing.
   * Returns true if the transition succeeded.
   */
  tryTransition(next: State): boolean {
    if (!this.transitions[this.state]?.includes(next)) {
      return false
    }

    this.state = next
    return true
  }

  reset(initial: State) {
    this.state = initial
  }
}