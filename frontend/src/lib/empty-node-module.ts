// Stub for Node.js built-ins (fs, path) referenced only in the unused
// Node.js runtime branch of Cornerstone3D's Emscripten wasm codec glue.
// Those codecs run via WebAssembly in the browser, so this module is never
// actually invoked — it exists purely to satisfy Turbopack's client bundle resolution.
export {};
