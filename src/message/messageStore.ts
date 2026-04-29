export interface Message {
  command: string;
  output: string;
  timestamp: Date;
  status: 'success' | 'error';
}

export class MessageStore {
  private messages: Message[] = [];
  private readonly maxHistory: number = 100;

  addMessage(command: string, output: string, status: 'success' | 'error'): void {
    this.messages.push({
      command,
      output,
      timestamp: new Date(),
      status,
    });

    if (this.messages.length > this.maxHistory) {
      this.messages = this.messages.slice(-this.maxHistory);
    }
  }

  clear(): void {
    this.messages = [];
  }

  getHistory(): Message[] {
    return [...this.messages];
  }
}
