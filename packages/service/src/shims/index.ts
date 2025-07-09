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

function createFileSystemErrorClass() {
  const FileSystemProviderErrorCode = {
    FileExists: 'EntryExists',
    FileNotFound: 'EntryNotFound',
    FileNotADirectory: 'EntryNotADirectory',
    FileIsADirectory: 'EntryIsADirectory',
    FileExceedsStorageQuota: 'EntryExceedsStorageQuota',
    FileTooLarge: 'EntryTooLarge',
    FileWriteLocked: 'EntryWriteLocked',
    NoPermissions: 'NoPermissions',
    Unavailable: 'Unavailable',
    Unknown: 'Unknown'
  }
  type FileSystemProviderErrorCode = string;

  function markAsFileSystemProviderError(error: Error, code: FileSystemProviderErrorCode): Error {
    error.name = code ? `${code} (FileSystemError)` : `FileSystemError`;

    return error;
  }

  /* eslint-disable @typescript-eslint/unbound-method */
  class FileSystemError extends Error {
    static FileExists(messageOrUri?: string | URI): FileSystemError {
      return new FileSystemError(messageOrUri, FileSystemProviderErrorCode.FileExists, FileSystemError.FileExists);
    }
    static FileNotFound(messageOrUri?: string | URI): FileSystemError {
      return new FileSystemError(messageOrUri, FileSystemProviderErrorCode.FileNotFound, FileSystemError.FileNotFound);
    }
    static FileNotADirectory(messageOrUri?: string | URI): FileSystemError {
      return new FileSystemError(messageOrUri, FileSystemProviderErrorCode.FileNotADirectory, FileSystemError.FileNotADirectory);
    }
    static FileIsADirectory(messageOrUri?: string | URI): FileSystemError {
      return new FileSystemError(messageOrUri, FileSystemProviderErrorCode.FileIsADirectory, FileSystemError.FileIsADirectory);
    }
    static NoPermissions(messageOrUri?: string | URI): FileSystemError {
      return new FileSystemError(messageOrUri, FileSystemProviderErrorCode.NoPermissions, FileSystemError.NoPermissions);
    }
    static Unavailable(messageOrUri?: string | URI): FileSystemError {
      return new FileSystemError(messageOrUri, FileSystemProviderErrorCode.Unavailable, FileSystemError.Unavailable);
    }

    readonly code: string;

    // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
    constructor(uriOrMessage?: string | URI, code: FileSystemProviderErrorCode = FileSystemProviderErrorCode.Unknown, terminator?: Function) {
      super(URI.isUri(uriOrMessage) ? uriOrMessage.toString(true) : uriOrMessage);

      this.code = terminator?.name ?? 'Unknown';

      // mark the error as file system provider error so that
      // we can extract the error code on the receiving side
      markAsFileSystemProviderError(this, code);

      // workaround when extending builtin objects and when compiling to ES5, see:
      // https://github.com/microsoft/TypeScript-wiki/blob/master/Breaking-Changes.md#extending-built-ins-like-error-array-and-map-may-no-longer-work
      Object.setPrototypeOf(this, FileSystemError.prototype);

      if (typeof Error.captureStackTrace === 'function' && typeof terminator === 'function') {
        // nice stack traces
        Error.captureStackTrace(this, terminator);
      }
    }
  }
  /* eslint-enable @typescript-eslint/unbound-method */

  return FileSystemError;
}

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
    initOptions.workspaceFolders
  );
  const commandsService = new CommandsShimService(delegate);
  const diagnosticsSerivce = new DiagnosticsShimService();
  const languageFeaturesService = new LanguageFeaturesShimService(delegate, diagnosticsSerivce);
  const windowService = new WindowShimService(delegate);
  const context = createContextShim(initOptions.tsExtLogPath ?? os.tmpdir(), initOptions.hostInfo, initOptions.extensionUri);

  const dispose = () => {
    configurationService.dispose();
    languageFeaturesService.dispose();
    commandsService.dispose();
    workspaceService.dispose();
    windowService.dispose();
    context.subscriptions.forEach((d) => {
      d.dispose();
    });
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
