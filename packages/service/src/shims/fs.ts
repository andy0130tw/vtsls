/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable } from '@vsc-ts/utils/dispose';
import * as fs from "fs";
import { promises as fsPromises } from "fs";
import type * as vscode from "vscode";
import { FileSystemError } from 'vscode';
import { URI } from 'vscode-uri';
import { FileSystemProviderErrorCode } from './fileSystemError';

export interface RegisterFileSystemProviderOptions {
  readonly isCaseSensitive?: boolean;
  readonly isReadonly?: boolean | vscode.MarkdownString;
}

export enum FileType {
  /**
   * File is unknown (neither file, directory nor symbolic link).
   */
  Unknown = 0,

  /**
   * File is a normal file.
   */
  File = 1,

  /**
   * File is a directory.
   */
  Directory = 2,

  /**
   * File is a symbolic link.
   *
   * Note: even when the file is a symbolic link, you can test for
   * `FileType.File` and `FileType.Directory` to know the type of
   * the target the link points to.
   */
  SymbolicLink = 64,
}

export enum FilePermission {
  /**
   * File is readonly.
   */
  Readonly = 1,
}

export interface FileStat {
  /**
   * The file type.
   */
  readonly type: FileType;

  /**
   * The last modification date represented as millis from unix epoch.
   */
  readonly mtime: number;

  /**
   * The creation date represented as millis from unix epoch.
   */
  readonly ctime: number;

  /**
   * The size of the file in bytes.
   */
  readonly size: number;

  /**
   * The file permissions.
   */
  readonly permissions?: FilePermission;
}

// from vscode/src/vs/base/node/pfs.ts
async function symLinkStat(path: string) {
  // First stat the link
  let lstats: fs.Stats | undefined;
  try {
    lstats = await fsPromises.lstat(path);

    // Return early if the stat is not a symbolic link at all
    if (!lstats.isSymbolicLink()) {
      return { stat: lstats };
    }
  } catch {
    /* ignore - use stat() instead */
  }

  // If the stat is a symbolic link or failed to stat, use fs.stat()
  // which for symbolic links will stat the target they point to
  try {
    const stats = await fsPromises.stat(path);

    return {
      stat: stats,
      symbolicLink: lstats?.isSymbolicLink() ? { dangling: false } : undefined,
    };
  } catch (error) {
    // If the link points to a nonexistent file we still want
    // to return it as result while setting dangling: true flag
    if (error.code === "ENOENT" && lstats) {
      return { stat: lstats, symbolicLink: { dangling: true } };
    }

    // Windows: workaround a node.js bug where reparse points
    // are not supported (https://github.com/nodejs/node/issues/36790)
    if (process.platform === "win32" && error.code === "EACCES") {
      try {
        const stats = await fsPromises.stat(await fsPromises.readlink(path));

        return { stat: stats, symbolicLink: { dangling: false } };
      } catch (error) {
        // If the link points to a nonexistent file we still want
        // to return it as result while setting dangling: true flag
        if (error.code === "ENOENT" && lstats) {
          return { stat: lstats, symbolicLink: { dangling: true } };
        }

        throw error;
      }
    }

    throw error;
  }
}

function toType(entry: fs.Stats, symbolicLink?: { dangling: boolean }): FileType {
  // Signal file type by checking for file / directory, except:
  // - symbolic links pointing to nonexistent files are FileType.Unknown
  // - files that are neither file nor directory are FileType.Unknown
  let type: FileType;
  if (symbolicLink?.dangling) {
    type = FileType.Unknown;
  } else if (entry.isFile()) {
    type = FileType.File;
  } else if (entry.isDirectory()) {
    type = FileType.Directory;
  } else {
    type = FileType.Unknown;
  }

  // Always signal symbolic link as file type additionally
  if (symbolicLink) {
    type |= FileType.SymbolicLink;
  }

  return type;
}

export function createFileSystemShim(extensionUri: URI | undefined) {
  // pretty classic way of defining private member, right?
  const _fsProvider = new Map<string, { impl: vscode.FileSystemProvider, isReadonly: boolean } >()

  function withProvider(scheme: string) {
    if (!_fsProvider.has(scheme)) {
      throw new Error(`Unsupported URI scheme ${scheme}`)
    }
    return _fsProvider.get(scheme)
  }

  // from path mapper
  function fromResource(uri: URI) {
    if (extensionUri
      && uri.scheme === extensionUri.scheme
      && uri.authority === extensionUri.authority
      && uri.path.startsWith(extensionUri.path + '/typescript/lib.')
      && uri.path.endsWith('.d.ts')) {
      return uri.path;
    }
    return `/${uri.scheme}/${uri.authority}${uri.path}`;
  }

  // from extHostFileSystemConsumer.ts
  async function mkdirp(provider: vscode.FileSystemProvider, uri: URI) {
    const pat = uri.path
    const toCreate: URI[] = []

    const dirname = (u: URI) => URI.from({...u, path: u.path.replace(/\/[^/]*$/, '')})

    let directory = dirname(uri)
    while (pat != '/') {
      try {
        const stat = await provider.stat(directory)
        if ((stat.type & FileType.Directory) == 0) {
          throw FileSystemError.FileExists(`Unable to create folder '${directory.scheme === 'file' ? directory.fsPath : directory.toString(true)}' that already exists but is not a directory`)
        }
        break  // found a existing dir, done
      } catch (err) {
        // FIXME: cannot use identity check on FileSystemError for MemFs
        if (err?.code !== FileSystemProviderErrorCode.FileNotFound &&
            ((err?.name ?? '') as string).split(' ')[0] !== FileSystemProviderErrorCode.FileNotFound) {
          throw err
        }
        toCreate.push(URI.from({...directory, path: directory.path + '/'}))
        directory = dirname(directory)
      }
    }

    for (let i = toCreate.length - 1; i >= 0; i--) {
      try {
        await provider.createDirectory(toCreate[i]);
      } catch (err) {
        if (err?.code !== FileSystemProviderErrorCode.FileExists &&
            ((err?.name ?? '') as string).split(' ')[0] !== FileSystemProviderErrorCode.FileExists) {
          throw err
        }
      }
    }
  }

  return {
    isWritableFileSystem(scheme: string): boolean | undefined {
      if (!_fsProvider.has(scheme)) return undefined
      return !_fsProvider.get(scheme)!.isReadonly
    },

    _addFileSystemProvider(scheme: string, provider: vscode.FileSystemProvider, options?: RegisterFileSystemProviderOptions): IDisposable {
      if (_fsProvider.has(scheme)) {
        throw new Error(`A provider with scheme ${scheme} is already registered`)
      }
      _fsProvider.set(scheme, {
        impl: provider,
        // TODO: extUri | extUriIgnoreCase
        isReadonly: !!options?.isReadonly,
      })

      return {
        dispose: () => {
          _fsProvider.delete(scheme)
        }
      }
    },

    async readFile(uri: vscode.Uri): Promise<Uint8Array> {
      const provider = withProvider(uri.scheme)
      if (provider) {
        return (await provider.impl.readFile(uri)).slice()
      }
      return new Uint8Array(await fsPromises.readFile(fromResource(uri))).slice()
    },

    async writeFile(uri: vscode.Uri, content: Uint8Array): Promise<void> {
      const provider = withProvider(uri.scheme)
      if (provider && !provider.isReadonly) {
        // TODO: make sure extUri exists
        await mkdirp(provider.impl, uri)
        return await provider.impl.writeFile(uri, content, { create: true, overwrite: true })
      }
      const pat = fromResource(uri)
      await fsPromises.mkdir(pat.replace(/\/[^/]*$/, ''), { recursive: true })
      await fsPromises.writeFile(pat, content)
    },

    async stat(uri: vscode.Uri): Promise<FileStat> {
      const provider = withProvider(uri.scheme)
      if (provider) {
        return await provider.impl.stat(uri)
      }
      const { stat, symbolicLink } = await symLinkStat(uri.fsPath); // cannot use fs.stat() here to support links properly
      return {
        type: toType(stat, symbolicLink),
        ctime: stat.birthtime.getTime(), // intentionally not using ctime here, we want the creation time
        mtime: stat.mtime.getTime(),
        size: stat.size,
      };
    },
  };
}
