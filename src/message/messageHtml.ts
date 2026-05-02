/**
 * HTML generation for the DITE Messages panel.
 *
 * Exports:
 *  - getHtmlContent: builds the full panel HTML with message history
 *  - getNonce: generates a CSP nonce for inline scripts
 */

import { Message } from './messageStore';
import { formatCelebiOutput } from '../formatOutput';

/** Generate a random nonce for Content-Security-Policy. */
export function getNonce(): string {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

/** Build the full DITE Messages panel HTML from the message history. */
export function getHtmlContent(messages: Message[]): string {
  const nonce = getNonce();
  const reversedMessages = [...messages].reverse();
  const messagesHtml = reversedMessages.map(msg => renderMessage(msg)).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';" />
    <title>DITE Messages</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Courier New', monospace;
            background: var(--vscode-editor-background);
            color: var(--vscode-foreground);
            padding: 8px;
            display: flex;
            flex-direction: column;
            height: 100vh;
        }
        .header {
            display: flex;
            justify-content: flex-end;
            align-items: center;
            margin-bottom: 8px;
            flex-shrink: 0;
        }
        .clear-btn {
            padding: 4px 8px;
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            border-radius: 3px;
            cursor: pointer;
            font-size: 11px;
            transition: background 0.2s;
        }
        .clear-btn:hover {
            background: var(--vscode-button-hoverBackground);
        }
        .messages-container {
            display: flex;
            flex-direction: column;
            gap: 12px;
            flex: 1;
            overflow-y: auto;
            min-height: 0;
        }
        .message {
            border-left: 3px solid var(--vscode-panel-border);
            padding: 8px 12px;
            background: var(--vscode-panel-background);
            border-radius: 3px;
        }
        .message.success {
            border-left-color: var(--vscode-testing-iconPassed);
        }
        .message.error {
            border-left-color: var(--vscode-errorForeground);
        }
        .command {
            font-family: 'Courier New', monospace;
            font-size: 12px;
            color: var(--vscode-textLink-foreground);
            margin-bottom: 4px;
        }
        .command::before {
            content: '$ ';
            color: var(--vscode-descriptionForeground);
        }
        .output {
            font-family: 'Courier New', monospace;
            font-size: 12px;
            white-space: pre-wrap;
            word-wrap: break-word;
            margin-bottom: 4px;
        }
        .output.success::before {
            content: '✓ ';
            color: var(--vscode-testing-iconPassed);
            font-weight: bold;
        }
        .output.error::before {
            content: '✗ ';
            color: var(--vscode-errorForeground);
            font-weight: bold;
        }
        .timestamp {
            font-size: 10px;
            color: var(--vscode-descriptionForeground);
            margin-top: 4px;
        }
        .empty-state {
            text-align: center;
            color: var(--vscode-descriptionForeground);
            padding: 20px 8px;
            font-size: 12px;
        }
    </style>
</head>
<body>
    <div class="header">
        <button class="clear-btn" id="clearBtn" aria-label="Clear all messages">Clear</button>
    </div>
    <div class="messages-container">
        ${messagesHtml || '<div class="empty-state">No messages yet. Run a command to see output here.</div>'}
    </div>
    <script nonce="${nonce}">
        const vscode = acquireVsCodeApi();
        document.getElementById('clearBtn').addEventListener('click', function() {
            vscode.postMessage({ command: 'clear' });
        });
    </script>
</body>
</html>`;
}

function renderMessage(msg: Message): string {
  const time = msg.timestamp.toLocaleTimeString();
  const statusClass = msg.status;
  console.log('[DEBUG messageHtml] raw output first 500:', msg.output?.substring(0, 500));
  const formattedOutput = formatCelebiOutput(msg.output, { showComments: false });
  console.log('[DEBUG messageHtml] formatted first 500:', formattedOutput?.substring(0, 500));

  return `<div class="message ${statusClass}">
      <div class="command">${escapeHtml(msg.command)}</div>
      <div class="output ${statusClass}">${formattedOutput}</div>
      <div class="timestamp">${time}</div>
  </div>`;
}

function escapeHtml(text: string): string {
  const map: { [key: string]: string } = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
    '`': '&#96;'
  };
  return text.replace(/[&<>"'`]/g, m => map[m]);
}
