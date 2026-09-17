"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import {
  fetchRadiologyVisualizationLayer,
  type RadiologyVisualizationLayer,
} from "@/app/radiology/_lib/radiology-api";

type CtVisualizationViewerProps = {
  analysisId: string;
  layers: RadiologyVisualizationLayer[];
  fetchLayer?: (layerId: string) => Promise<ArrayBuffer>;
};

const CATEGORY_LABELS: Record<RadiologyVisualizationLayer["category"], string> = {
  NODULE: "병변",
  LUNG_LOBE: "폐엽",
  ANATOMY: "해부 구조",
};

export function CtVisualizationViewer({ analysisId, layers, fetchLayer }: CtVisualizationViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [layerProgress, setLayerProgress] = useState({ loaded: 0, total: layers.length });
  const [wireframe, setWireframe] = useState(false);
  const [visibility, setVisibility] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(layers.map((layer) => [layer.id, layer.default_visible])),
  );
  const [opacity, setOpacity] = useState<Record<string, number>>(() =>
    Object.fromEntries(layers.map((layer) => [layer.id, layer.default_opacity])),
  );

  const wireframeRef = useRef(wireframe);
  const visibilityRef = useRef(visibility);
  const opacityRef = useRef(opacity);
  useEffect(() => {
    wireframeRef.current = wireframe;
    visibilityRef.current = visibility;
    opacityRef.current = opacity;
  }, [wireframe, visibility, opacity]);

  const groupedLayers = useMemo(() => {
    const groups = new Map<RadiologyVisualizationLayer["category"], RadiologyVisualizationLayer[]>();
    for (const layer of layers) {
      const bucket = groups.get(layer.category) ?? [];
      bucket.push(layer);
      groups.set(layer.category, bucket);
    }
    return groups;
  }, [layers]);

  useEffect(() => {
    let disposed = false;
    let renderer: import("three").WebGLRenderer | null = null;
    let controls: import("three/addons/controls/OrbitControls.js").OrbitControls | null = null;
    let scene: import("three").Scene | null = null;
    let frameHandle = 0;
    let resizeObserver: ResizeObserver | null = null;
    queueMicrotask(() => {
      if (disposed) return;
      setLoading(true);
      setError("");
      setLayerProgress({ loaded: 0, total: layers.length });
      setVisibility(Object.fromEntries(layers.map((layer) => [layer.id, layer.default_visible])));
      setOpacity(Object.fromEntries(layers.map((layer) => [layer.id, layer.default_opacity])));
    });

    void Promise.all([
      import("three"),
      import("three/addons/loaders/GLTFLoader.js"),
      import("three/addons/controls/OrbitControls.js"),
    ])
      .then(async ([THREE, { GLTFLoader }, { OrbitControls }]) => {
        if (disposed || !containerRef.current) return;
        const container = containerRef.current;

        const activeScene = new THREE.Scene();
        scene = activeScene;
        const camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 5000);
        camera.position.set(0, -300, 150);
        camera.up.set(0, 0, 1);

        renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.setSize(container.clientWidth, container.clientHeight);
        container.appendChild(renderer.domElement);

        activeScene.add(new THREE.AmbientLight(0xffffff, 0.6));
        const keyLight = new THREE.DirectionalLight(0xffffff, 0.8);
        keyLight.position.set(200, -200, 300);
        activeScene.add(keyLight);
        // Fill light from the opposite side so faces facing away from keyLight
        // aren't left fully unlit.
        const fillLight = new THREE.DirectionalLight(0xffffff, 0.35);
        fillLight.position.set(-200, 200, 100);
        activeScene.add(fillLight);

        controls = new OrbitControls(camera, renderer.domElement);
        controls.target.set(0, 0, 0);
        controls.update();

        const loader = new GLTFLoader();
        let completedLayerCount = 0;
        const results = await Promise.all(
          layers.map(async (layer) => {
            try {
              const buffer = await (fetchLayer ? fetchLayer(layer.id) : fetchRadiologyVisualizationLayer(analysisId, layer.id));
              const gltf = await loader.parseAsync(buffer, "");
              return { layer, scene: gltf.scene as import("three").Object3D };
            } catch {
              return { layer, scene: null };
            } finally {
              completedLayerCount += 1;
              if (!disposed) {
                setLayerProgress({ loaded: completedLayerCount, total: layers.length });
              }
            }
          }),
        );
        if (disposed) return;

        const meshes = new Map<string, import("three").Object3D>();
        const bounds = new THREE.Box3();
        for (const { layer, scene: layerScene } of results) {
          if (!layerScene) continue;
          layerScene.traverse((child) => {
            const mesh = child as import("three").Mesh;
            if (!mesh.isMesh) return;
            const material = mesh.material as import("three").MeshStandardMaterial;
            material.transparent = true;
            material.side = THREE.DoubleSide;
            material.wireframe = false;
            // The GLB's mesh primitives carry no material (only vertex colors),
            // so glTF's implicit default material applies: metalness 1 / roughness 1.
            // A fully metallic surface has no diffuse response and renders almost
            // black without an environment map, which is why layers looked dark.
            material.metalness = 0;
            material.roughness = 0.7;
            const wireframeOverlay = new THREE.LineSegments(
              new THREE.WireframeGeometry(mesh.geometry),
              new THREE.LineBasicMaterial({
                color: layer.color,
                transparent: true,
                opacity: layer.default_opacity,
              }),
            );
            wireframeOverlay.visible = false;
            wireframeOverlay.userData.isWireframeOverlay = true;
            mesh.add(wireframeOverlay);
          });
          meshes.set(layer.id, layerScene);
          activeScene.add(layerScene);
          bounds.expandByObject(layerScene);
        }

        if (!bounds.isEmpty()) {
          const center = bounds.getCenter(new THREE.Vector3());
          const size = bounds.getSize(new THREE.Vector3()).length();
          camera.position.set(center.x, center.y - size, center.z + size * 0.4);
          camera.lookAt(center);
          controls.target.copy(center);
          controls.update();
        }

        const failedCount = results.filter((item) => item.scene === null).length;
        setError(failedCount > 0 ? `${failedCount}개 레이어를 불러오지 못했습니다.` : "");
        setLoading(false);

        const renderLoop = () => {
          for (const [layerId, object] of meshes) {
            object.visible = visibilityRef.current[layerId] ?? true;
            object.traverse((child) => {
              if (child.userData.isWireframeOverlay) {
                child.visible = wireframeRef.current;
                const lineMaterial = (child as import("three").LineSegments).material as import("three").LineBasicMaterial;
                lineMaterial.opacity = opacityRef.current[layerId] ?? 1;
                return;
              }
              const mesh = child as import("three").Mesh;
              if (!mesh.isMesh) return;
              const material = mesh.material as import("three").MeshStandardMaterial;
              material.opacity = opacityRef.current[layerId] ?? 1;
              material.visible = !wireframeRef.current;
            });
          }
          controls?.update();
          renderer?.render(activeScene, camera);
          frameHandle = requestAnimationFrame(renderLoop);
        };
        renderLoop();

        resizeObserver = new ResizeObserver(() => {
          if (!renderer || !container) return;
          camera.aspect = container.clientWidth / container.clientHeight;
          camera.updateProjectionMatrix();
          renderer.setSize(container.clientWidth, container.clientHeight);
        });
        resizeObserver.observe(container);
      })
      .catch(() => {
        if (!disposed) {
          setError("3D 뷰어를 초기화하지 못했습니다.");
          setLoading(false);
        }
      });

    return () => {
      disposed = true;
      cancelAnimationFrame(frameHandle);
      resizeObserver?.disconnect();
      controls?.dispose();
      scene?.traverse((child) => {
        const renderable = child as import("three").Mesh;
        if (renderable.geometry) renderable.geometry.dispose();
        const material = renderable.material;
        if (Array.isArray(material)) material.forEach((item) => item.dispose());
        else material?.dispose();
      });
      renderer?.dispose();
      renderer?.domElement.remove();
    };
  }, [analysisId, layers, fetchLayer]);

  if (layers.length === 0) {
    return (
      <div className="grid min-h-[360px] place-items-center bg-slate-950 text-xs text-slate-400">
        CT 3D 시각화 레이어가 없습니다.
      </div>
    );
  }

  return (
    <div className="grid h-full min-h-0 grid-cols-[minmax(0,1fr)_160px] overflow-hidden bg-slate-950">
      <div className="relative min-h-0">
        <div ref={containerRef} className="absolute inset-0" aria-label="CT 3D 뷰어" />
        {layerProgress.total > 0 && layerProgress.loaded < layerProgress.total && (
          <div className="absolute left-2 top-2 z-10 rounded bg-black/70 px-2 py-1 text-[10px] font-semibold text-white">
            3D 레이어 {layerProgress.loaded}/{layerProgress.total}
            {layerProgress.loaded >= layerProgress.total ? " · 완료" : " · 불러오는 중"}
          </div>
        )}
        {loading && (
          <div className="absolute inset-0 grid place-items-center text-xs font-semibold text-slate-300">
            3D 모델을 불러오는 중입니다.
          </div>
        )}
        {!loading && error && (
          <div role="alert" className="absolute bottom-2 left-2 right-2 rounded bg-rose-950/80 px-2 py-1 text-[10px] text-rose-200">
            {error}
          </div>
        )}
        <button
          type="button"
          onClick={() => setWireframe((value) => !value)}
          className="absolute right-2 top-2 rounded bg-black/60 px-2 py-1 text-[9px] font-semibold text-white"
        >
          {wireframe ? "표면 보기" : "와이어프레임"}
        </button>
      </div>

      <aside className="min-h-0 overflow-y-auto border-l border-slate-800 bg-slate-900 p-2" aria-label="레이어 목록">
        {[...groupedLayers.entries()].map(([category, categoryLayers]) => (
          <div key={category} className="mb-3">
            <p className="mb-1 text-[9px] font-semibold text-slate-400">{CATEGORY_LABELS[category]}</p>
            <div className="space-y-1.5">
              {categoryLayers.map((layer) => (
                <div key={layer.id} className="rounded bg-slate-800/60 px-1.5 py-1">
                  <label className="flex items-center gap-1.5 text-[9px] text-slate-200">
                    <input
                      type="checkbox"
                      checked={visibility[layer.id] ?? layer.default_visible}
                      onChange={(event) =>
                        setVisibility((current) => ({ ...current, [layer.id]: event.target.checked }))
                      }
                    />
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: layer.color }} />
                    <span className="truncate">{layer.name}</span>
                  </label>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={opacity[layer.id] ?? layer.default_opacity}
                    onChange={(event) =>
                      setOpacity((current) => ({ ...current, [layer.id]: Number(event.target.value) }))
                    }
                    className="mt-1 w-full"
                  />
                </div>
              ))}
            </div>
          </div>
        ))}
      </aside>
    </div>
  );
}
