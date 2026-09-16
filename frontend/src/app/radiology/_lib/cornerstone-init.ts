export interface CornerstoneModules {
  core: typeof import("@cornerstonejs/core");
  dicomImageLoader: typeof import("@cornerstonejs/dicom-image-loader").default;
  tools: typeof import("@cornerstonejs/tools");
}

let modulesPromise: Promise<CornerstoneModules> | null = null;
let initialized = false;

async function loadModules(): Promise<CornerstoneModules> {
  const [core, dicomImageLoaderModule, tools] = await Promise.all([
    import("@cornerstonejs/core"),
    import("@cornerstonejs/dicom-image-loader"),
    import("@cornerstonejs/tools"),
  ]);
  return { core, dicomImageLoader: dicomImageLoaderModule.default, tools };
}

/**
 * Dynamically imports and initializes Cornerstone3D (core, DICOM loader, tools) on first
 * call, client-side only. Safe to call repeatedly; subsequent calls resolve to the same
 * modules without re-initializing.
 */
export async function ensureCornerstoneInitialized(): Promise<CornerstoneModules> {
  if (!modulesPromise) modulesPromise = loadModules();
  const modules = await modulesPromise;
  if (!initialized) {
    initialized = true;
    await modules.core.init();
    modules.dicomImageLoader.init();
    modules.tools.init();
  }
  return modules;
}
