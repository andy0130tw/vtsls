export { createTSLanguageService, TSLanguageService } from "./main";
export * from "./protocol";
export * from "./types";

// reexport the fs that might be embedded in browser builds
export * as fs from 'fs';
export * as fsPromises from 'fs/promises';
