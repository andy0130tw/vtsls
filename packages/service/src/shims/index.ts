import * as l10n from "@vscode/l10n";
import * as os from "os";
import { Emitter } from "vscode-languageserver-protocol";
import { URI, Utils } from "vscode-uri";
import { TSLanguageServiceDelegate } from "../service/delegate";
import { TSLanguageServiceConfig, TSLanguageServiceOptions } from "../service/types";
import { createChatShim } from "./chat";
import { CommandsShimService } from "./commands";
import { ConfigurationShimService } from "./configuration";
import { createContextShim } from "./context";
import { DiagnosticsShimService } from "./diagnostics";
import { createExtensionsShim } from "./extensions";
import { LanguageFeaturesShimService } from "./languageFeatures";
import { UIKind } from "./types";
import { WindowShimService } from "./window";
import { WorkspaceShimService } from "./workspace";
import { createFileSystemErrorClass } from "./fileSystemError";
import { FileType } from './fs';
import { IDisposable } from '@vsc-ts/utils/dispose';

// in vscode namespace
export const extensions: typeof import("vscode").extensions = createExtensionsShim() as any;
export let languages: typeof import("vscode").languages;
export let commands: typeof import("vscode").commands;
export let window: typeof import("vscode").window;
export let env: typeof import("vscode").env;
export let workspace: typeof import("vscode").workspace;
export let chat: typeof import("vscode").chat;
export { CancellationTokenSource } from "vscode-languageserver-protocol";
export { FilePermission, FileStat, FileType } from "./fs";
export { LogLevel } from "./log";
export * from "./types";
export { l10n };
export const EventEmitter = Emitter;
export const Uri = new Proxy(URI, {
  get(target, p) {
    return target[p as keyof typeof URI] ?? Utils[p as keyof typeof Utils];
  },
});
export let FileSystemError: typeof import("vscode").FileSystemError;

export function initializeShimServices(
  initOptions: TSLanguageServiceOptions,
  delegate: TSLanguageServiceDelegate,
  defaultConfig: TSLanguageServiceConfig,
  defaultNls: l10n.l10nJsonFormat
) {
  l10n.config({ contents: defaultNls });

  const configurationService = new ConfigurationShimService(defaultConfig);
  const workspaceService = new WorkspaceShimService(
    delegate,
    configurationService,
    initOptions.workspaceFolders,
    initOptions.extensionUri
  );
  const commandsService = new CommandsShimService(delegate);
  const diagnosticsSerivce = new DiagnosticsShimService();
  const languageFeaturesService = new LanguageFeaturesShimService(delegate, diagnosticsSerivce);
  const windowService = new WindowShimService(delegate);
  const context = createContextShim(initOptions.tsExtLogPath ?? os.tmpdir(), initOptions.hostInfo, initOptions.extensionUri);

  const FsProviderDisposables: IDisposable[] = []

  if (process.env.BROWSER_ENV) {
    // from webWorkerFileSystemProvider.ts
    const fetchFileSystemProvider = {
      async readFile(uri: URI) {
        // FIXME: this is horribly wrong
        const urlStr = uri.toString(true).replace('/dist/browser/', '/')
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call
        const res = await (globalThis as any).fetch(urlStr)
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return
        return res.bytes()
      },
      stat() {
        // just fake everything
        return {
          type: FileType.File,
          size: 0,
          mtime: 0,
          ctime: 0,
        }
      },
    } satisfies Partial<import('vscode').FileSystemProvider> as any

    FsProviderDisposables.push(workspaceService.registerFileSystemProvider('http', fetchFileSystemProvider, {}))
    FsProviderDisposables.push(workspaceService.registerFileSystemProvider('https', fetchFileSystemProvider, {}))
  }

  const dispose = () => {
    configurationService.dispose();
    languageFeaturesService.dispose();
    commandsService.dispose();
    workspaceService.dispose();
    windowService.dispose();
    context.subscriptions.forEach((d) => {
      d.dispose();
    });
    FsProviderDisposables.forEach((d) => { d.dispose() })
  };

  languages = languageFeaturesService as any;
  commands = commandsService as any;
  workspace = workspaceService as any;
  window = windowService as any;
  env = {
    language: initOptions.locale ?? "en",
    openExternal: (uri: import("vscode").Uri) => delegate.openExternal(uri.toString(true)),
    uiKind: process.env.BROWSER_ENV ? UIKind.Web : UIKind.Desktop,
  } as any;
  chat = createChatShim() as any;

  FileSystemError = createFileSystemErrorClass()

  return {
    configurationService,
    workspaceService,
    commandsService,
    diagnosticsSerivce,
    languageFeaturesService,
    windowService,
    context,
    l10n,
    extensions,
    env,
    chat,
    dispose,
  };
}
