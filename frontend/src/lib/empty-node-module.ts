// Stub for Node.js built-ins (fs, path) referenced only in the unused
// Node.js runtime branch of Cornerstone3D's Emscripten wasm codec glue.
// Those codecs run via WebAssembly in the browser, so this module is never
// actually invoked — it exists purely to satisfy Turbopack's client bundle resolution.
// Turbopack also evaluates aliases while building SSR route modules, some of
// which import Node built-ins with a default import. Provide a harmless default
// value as well as the no-op module used by Cornerstone's browser-only branch.
const emptyNodeModule = {};

export default emptyNodeModule;
