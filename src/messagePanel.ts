export interface Message {
  command: string;
  output: string;
  timestamp: Date;
  status: 'success' | 'error';
}

export class MessageStore {
  private messages: Message[] = [];

  addMessage(command: string, output: string, status: 'success' | 'error'): void {
    this.messages.push({
      command,
      output,
      timestamp: new Date(),
      status,
    });
  }

  clear(): void {
    this.messages = [];
  }

  getHistory(): Message[] {
    return [...this.messages];
  }
}
