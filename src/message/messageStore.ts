/**
 * In-memory store for command execution messages.
 *
 * Keeps the last `maxHistory` messages.  Used by MessagePanelProvider
 * to render the DITE Messages panel and by executeAndLog() to record
 * Python command results.
 */

export interface Message {
  command: string;
  output: string;
  timestamp: Date;
  status: 'success' | 'error';
}

export class MessageStore {
  private messages: Message[] = [];
  private readonly maxHistory: number = 100;

  /** Record a command execution result. */
  addMessage(command: string, output: string, status: 'success' | 'error'): void {
    this.messages.push({
      command,
      output,
      timestamp: new Date(),
      status,
    });

    // Enforce history cap
    if (this.messages.length > this.maxHistory) {
      this.messages = this.messages.slice(-this.maxHistory);
    }
  }

  /** Clear all stored messages. */
  clear(): void {
    this.messages = [];
  }

  /** Return a copy of the message history (most recent last). */
  getHistory(): Message[] {
    return [...this.messages];
  }
}
