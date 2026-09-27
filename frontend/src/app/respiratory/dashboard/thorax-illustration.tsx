import { useId } from "react";

export type ThoraxLesion = {
  id: string;
  label: string;
  lobe: "RUL" | "RML" | "RLL" | "LUL" | "LLL";
  diameterMm?: number;
};

const LOBE_POINTS: Record<ThoraxLesion["lobe"], { x: number; y: number }> = {
  RUL: { x: 110, y: 126 },
  RML: { x: 105, y: 181 },
  RLL: { x: 111, y: 237 },
  LUL: { x: 209, y: 126 },
  LLL: { x: 211, y: 226 },
};

const STAGE_ACCENTS: Record<string, { solid: string; soft: string }> = {
  XRAY: { solid: "#f59e0b", soft: "#fef3c7" },
  CT: { solid: "#f97316", soft: "#ffedd5" },
  PET_CT_TNM: { solid: "#ef4444", soft: "#fee2e2" },
  PATHOLOGY_GENE: { solid: "#8b5cf6", soft: "#ede9fe" },
  PDL1: { solid: "#ec4899", soft: "#fce7f3" },
  TREATMENT: { solid: "#14b8a6", soft: "#ccfbf1" },
  PRESCRIPTION: { solid: "#3b82f6", soft: "#dbeafe" },
};

/** Generated medical reference image with markers sourced only from confirmed CT observations. */
export function ThoraxIllustration({
  lesions = [],
  stage,
}: {
  lesions?: ThoraxLesion[];
  stage?: string;
}) {
  const rawId = useId().replace(/:/g, "");
  const glowId = `thorax-marker-glow-${rawId}`;
  const accent = STAGE_ACCENTS[stage ?? ""] ?? STAGE_ACCENTS.CT;

  return (
    <svg
      viewBox="0 0 320 340"
      className="h-full w-full"
      role="img"
      aria-label={lesions.length ? `확정 CT 병변 위치 ${lesions.length}곳` : "폐와 흉곽의 3D 의료 참고 이미지"}
    >
      <defs>
        <filter id={glowId} x="-100%" y="-100%" width="300%" height="300%">
          <feDropShadow dx="0" dy="2" stdDeviation="4" floodColor={accent.solid} floodOpacity=".72" />
        </filter>
        <linearGradient id={`fade-${rawId}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity=".2" />
          <stop offset=".72" stopColor="#fff" stopOpacity="0" />
          <stop offset="1" stopColor="#08182d" stopOpacity=".12" />
        </linearGradient>
      </defs>

      <image
        href="/images/thorax-medical-visual-v2.webp"
        x="6"
        y="0"
        width="308"
        height="340"
        preserveAspectRatio="xMidYMid slice"
      />
      <rect x="6" width="308" height="340" rx="8" fill={`url(#fade-${rawId})`} pointerEvents="none" />

      {lesions.slice(0, 4).map((lesion, index) => {
        const point = LOBE_POINTS[lesion.lobe];
        const offset = index * 3;
        return (
          <g key={lesion.id} transform={`translate(${point.x + offset} ${point.y + offset})`} filter={`url(#${glowId})`}>
            <circle r="18" fill={accent.soft} fillOpacity=".28" stroke={accent.solid} strokeOpacity=".45" />
            <circle r="10" fill="none" stroke={accent.solid} strokeWidth="2.2">
              <animate attributeName="r" values="8;15;8" dur="2.8s" repeatCount="indefinite" />
              <animate attributeName="opacity" values=".9;.2;.9" dur="2.8s" repeatCount="indefinite" />
            </circle>
            <circle r="5" fill={accent.solid} stroke="#fff" strokeWidth="2" />
            <text x="0" y="-23" textAnchor="middle" fill="#fff" stroke="#17324a" strokeWidth="2.5" paintOrder="stroke" fontFamily="sans-serif" fontSize="11" fontWeight="700">
              {index + 1}
            </text>
            <title>{lesion.label}{lesion.diameterMm ? ` · ${lesion.diameterMm} mm` : ""}</title>
          </g>
        );
      })}
    </svg>
  );
}
