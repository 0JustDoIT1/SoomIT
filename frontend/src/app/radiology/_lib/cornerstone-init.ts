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
    modules.dicomImageLoader.init({
      beforeSend: (_xhr, _imageId, defaultHeaders) => {
        const accessToken = sessionStorage.getItem("accessToken");
        return accessToken
          ? { ...defaultHeaders, Authorization: `Bearer ${accessToken}` }
          : defaultHeaders;
      },
    });
    modules.tools.init();
    modules.core.volumeLoader.registerVolumeLoader(
      "cornerstoneStreamingImageVolume",
      modules.core.cornerstoneStreamingImageVolumeLoader,
    );
    modules.core.imageLoadPoolManager.setMaxSimultaneousRequests(
      modules.core.Enums.RequestType.Interaction,
      6,
    );
    modules.core.imageLoadPoolManager.setMaxSimultaneousRequests(
      modules.core.Enums.RequestType.Prefetch,
      4,
    );
  }
  return modules;
}
