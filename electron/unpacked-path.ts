/**
 * Files that are executed by an external process (system `node`, shells) or
 * read via plain fs APIs outside Electron must come from app.asar.unpacked.
 * In dev this is a no-op. Pure (no Electron import) so providers and services
 * stay loadable outside Electron, e.g. in unit tests.
 */
export function toUnpackedPath(filePath: string): string {
  return filePath.replace(/app\.asar(?=[\\/])/, "app.asar.unpacked");
}
