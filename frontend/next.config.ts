import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  output: 'standalone',
  // Cornerstone3D's DICOM image loader pulls in Emscripten-generated wasm codec
  // glue (openjpeg/openjph/charls/libjpeg-turbo) that references Node's fs/path
  // as an optional Node.js runtime fallback. Those codecs run in the browser via
  // wasm, so the Node-only branch is never taken; alias fs/path to a no-op stub
  // to satisfy Turbopack's client bundle resolution.
  turbopack: {
    resolveAlias: {
      fs: './src/lib/empty-node-module.ts',
      path: './src/lib/empty-node-module.ts',
    },
  },
  webpack: (config) => {
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      path: false,
    };
    return config;
  },
};

export default nextConfig;
