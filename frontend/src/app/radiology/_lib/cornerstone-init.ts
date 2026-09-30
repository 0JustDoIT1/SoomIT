export interface CornerstoneModules {
  core: typeof import("@cornerstonejs/core");
  dicomImageLoader: typeof import("@cornerstonejs/dicom-image-loader").default;
  tools: typeof import("@cornerstonejs/tools");
}

let modulesPromise: Promise<CornerstoneModules> | null = null;
let initializationPromise: Promise<void> | null = null;

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
  if (!initializationPromise) {
    initializationPromise = (async () => {
    // Cornerstone's default ContextPool allocates seven WebGL contexts for
    // every RenderingEngine. The CT workstation, history previews, and other
    // image views can then exceed the browser context limit and blank every
    // viewport. A single shared context supports our MPR/3D viewports while
    // keeping the application safely below that limit.
    await modules.core.init({
      rendering: {
        webGlContextCount: 1,
      },
      debug: {},
    });
    modules.dicomImageLoader.init({
      beforeSend: (_xhr, _imageId, defaultHeaders) => {
        const accessToken = sessionStorage.getItem("accessToken");
        return accessToken
          ? { ...defaultHeaders, Authorization: `Bearer ${accessToken}` }
          : defaultHeaders;
      },
    });
    modules.tools.init();
    modules.core.imageLoadPoolManager.setMaxSimultaneousRequests(
      modules.core.Enums.RequestType.Interaction,
      8,
    );
    modules.core.imageLoadPoolManager.setMaxSimultaneousRequests(
      modules.core.Enums.RequestType.Prefetch,
      8,
    );
    })().catch((error: unknown) => {
      initializationPromise = null;
      throw error;
    });
  }
  await initializationPromise;
  return modules;
}
