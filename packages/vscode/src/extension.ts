import * as vscode from 'vscode';
import { SeemoreSession } from './session.js';

export function activate(context: vscode.ExtensionContext): void {
  const session = new SeemoreSession(context);
  context.subscriptions.push(
    { dispose: () => session.dispose() },
    vscode.commands.registerCommand('seemore.open', (uri: vscode.Uri | undefined) => {
      const target = uri ?? vscode.window.activeTextEditor?.document.uri;
      if (target === undefined) return;
      void session.openFile(target);
    }),
    vscode.commands.registerCommand('seemore.openFolder', (uri: vscode.Uri | undefined) => {
      if (uri === undefined) return;
      void session.openFolder(uri);
    }),
    vscode.commands.registerCommand('seemore.pinLiveRoot', () => void session.pinLiveRoot()),
  );
}

export function deactivate(): void {
  // Subscriptions are disposed by the extension host, which runs the `session.dispose()`
  // registered above — that is what actually kills the child process.
}
