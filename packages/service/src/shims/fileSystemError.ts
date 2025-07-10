import { URI } from 'vscode-uri';

export const FileSystemProviderErrorCode = {
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

export function createFileSystemErrorClass() {
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
