import type { CodeActionKind } from "vscode-languageserver-protocol";
import { CompletionCache } from "./completion";
import { tsCommands } from "./pkgJson";

// "*" from jsdoc completion
export const completionTriggerCharacters = [".", '"', "'", "`", "/", "@", "<", "#", " ", "*"];

export const signatureHelpTriggerCharacters = ["(", ",", "<"];

export const signatureHelpReTriggerCharacters = [")"];

export const codeActionKinds = [
  'source'                 satisfies typeof CodeActionKind.Source,
  'source.fixAll'          satisfies typeof CodeActionKind.SourceFixAll,
  'source.organizeImports' satisfies typeof CodeActionKind.SourceOrganizeImports,
  'quickfix'               satisfies typeof CodeActionKind.QuickFix,
  'refactor'               satisfies typeof CodeActionKind.Refactor,
  'refactor.extract'       satisfies typeof CodeActionKind.RefactorExtract,
  'refactor.rewrite'       satisfies typeof CodeActionKind.RefactorRewrite,
  'refactor.inline'        satisfies typeof CodeActionKind.RefactorInline,
];

export const semanticTokenTypes = [
  "class",
  "enum",
  "interface",
  "namespace",
  "typeParameter",
  "type",
  "parameter",
  "variable",
  "enumMember",
  "property",
  "function",
  "method",
];
export const semanticTokenModifiers = [
  "declaration",
  "static",
  "async",
  "readonly",
  "defaultLibrary",
  "local",
];

export const commands = [...tsCommands, CompletionCache.id];

export const onTypeFormatFirstTriggerCharacter = ";";
export const onTypeFormatMoreTriggerCharacter = ["}", "\n"];

export { ProviderNotFoundError } from "../shims/languageFeatures";
export { DocumentNotOpenedError } from "../shims/workspace";
