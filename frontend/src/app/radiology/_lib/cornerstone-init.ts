export interface CornerstoneModules {
  core: typeof import("@cornerstonejs/core");
  dicomImageLoader: typeof import("@cornerstonejs/dicom-image-loader").default;
}

let modulesPromise: Promise<CornerstoneModules> | null = null;
let initialized = false;

async function loadModules(): Promise<CornerstoneModules> {
  const [core, dicomImageLoaderModule] = await Promise.all([
    import("@cornerstonejs/core"),
    import("@cornerstonejs/dicom-image-loader"),
  ]);
  return { core, dicomImageLoader: dicomImageLoaderModule.default };
}

/**
 * Dynamically imports and initializes Cornerstone3D on first call, client-side only.
 * Safe to call repeatedly; subsequent calls resolve to the same modules without re-initializing.
 */
export async function ensureCornerstoneInitialized(): Promise<CornerstoneModules> {
  if (!modulesPromise) modulesPromise = loadModules();
  const modules = await modulesPromise;
  if (!initialized) {
    initialized = true;
    await modules.core.init();
    modules.dicomImageLoader.init();
  }
  return modules;
}
