import { ensureCornerstoneInitialized } from "../../radiology/_lib/cornerstone-init";

/** Decode just one authenticated instance; never load an entire CT/PET volume. */
export async function createDicomPreview(blob: Blob, signal: AbortSignal): Promise<Blob> {
  const { core, dicomImageLoader } = await ensureCornerstoneInitialized();
  signal.throwIfAborted();
  const imageId = dicomImageLoader.wadouri.fileManager.add(new File([blob], "dashboard.dcm", { type: "application/dicom" }));
  try {
    const image = await core.imageLoader.loadAndCacheImage(imageId);
    signal.throwIfAborted();
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 512;
    await core.utilities.renderToCanvasCPU(canvas, image);
    signal.throwIfAborted();
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error("Preview failed")), "image/png"));
  } finally {
    core.cache.removeImageLoadObject(imageId);
    dicomImageLoader.wadouri.fileManager.remove(Number(imageId.split(":")[1]));
  }
}
