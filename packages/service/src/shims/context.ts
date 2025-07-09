import type * as vscode from "vscode";
import { URI } from "vscode-uri";
import { Memento } from "./memento";

export function createContextShim(logPath: string, hostInfo?: string, extensionUri?: string) {
  return {
    logPath,
    hostInfo,
    subscriptions: [],
    workspaceState: new Memento(),
    globalState: new Memento(),
    extensionUri: extensionUri != null ? URI.parse(extensionUri) : URI.from({ scheme: "virtual" }),
  } as unknown as vscode.ExtensionContext;
}
