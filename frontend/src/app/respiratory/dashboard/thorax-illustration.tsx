import { useId } from "react";

export type ThoraxLesion = {
  id: string;
  label: string;
  lobe: "RUL" | "RML" | "RLL" | "LUL" | "LLL";
  diameterMm?: number;
};

const LOBE_POINTS: Record<ThoraxLesion["lobe"], { x: number; y: number }> = {
  RUL: { x: 111, y: 112 },
  RML: { x: 104, y: 176 },
  RLL: { x: 112, y: 238 },
  LUL: { x: 210, y: 116 },
  LLL: { x: 218, y: 226 },
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

/** Anatomical reference with markers sourced only from confirmed CT observations. */
export function ThoraxIllustration({
  lesions = [],
  stage,
}: {
  lesions?: ThoraxLesion[];
  stage?: string;
}) {
  const rawId = useId().replace(/:/g, "");
  const tissueId = `thorax-tissue-${rawId}`;
  const lungId = `thorax-lung-${rawId}`;
  const hilumId = `thorax-hilum-${rawId}`;
  const accent = STAGE_ACCENTS[stage ?? ""] ?? STAGE_ACCENTS.CT;

  return (
    <svg
      viewBox="0 0 320 340"
      className="h-full w-full"
      role="img"
      aria-label={lesions.length ? `확정 CT 병변 위치 ${lesions.length}곳` : "흉곽과 폐의 해부학적 참고 그림, 환자 병변 위치 정보 없음"}
    >
      <defs>
        <radialGradient id={tissueId}>
          <stop stopColor="#dcebf0" stopOpacity=".82" />
          <stop offset="1" stopColor="#a9c4d0" stopOpacity=".12" />
        </radialGradient>
        <linearGradient id={lungId} x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#d5eef1" stopOpacity=".92" />
          <stop offset=".55" stopColor="#8db8c4" stopOpacity=".68" />
          <stop offset="1" stopColor="#5f879a" stopOpacity=".72" />
        </linearGradient>
        <radialGradient id={hilumId}>
          <stop stopColor="#f8ffff" stopOpacity=".88" />
          <stop offset="1" stopColor="#d7ecf0" stopOpacity="0" />
        </radialGradient>
        <filter id={`lesion-shadow-${rawId}`} x="-100%" y="-100%" width="300%" height="300%">
          <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor={accent.solid} floodOpacity=".32" />
        </filter>
      </defs>

      <path d="M132 18 127 40C112 50 64 49 43 78 23 110 25 192 39 244L53 318Q160 337 267 318L281 244C295 192 297 110 277 78 256 49 208 50 193 40L188 18" fill={`url(#${tissueId})`} stroke="#9db7c2" strokeOpacity=".58" />
      <g fill="none" stroke="#8ba7b3" strokeOpacity=".24">
        <path d="M153 62Q106 39 53 78M167 62Q214 39 267 78" strokeWidth="5" />
        {Array.from({ length: 9 }, (_, index) => {
          const y = 83 + index * 23;
          return <path key={y} d={`M151 ${y} C112 ${y - 19} 58 ${y - 12} 44 ${y + 8} Q77 ${y + 32} 146 ${y + 22} M169 ${y} C208 ${y - 19} 262 ${y - 12} 276 ${y + 8} Q243 ${y + 32} 174 ${y + 22}`} strokeWidth="2.8" />;
        })}
        <path d="M159 28V297" strokeWidth="11" strokeOpacity=".18" />
      </g>
      <path d="M134 65C116 49 79 80 63 115 48 150 44 217 52 261 57 286 87 289 133 277 148 272 147 249 144 221L142 131C143 102 146 78 134 65Z" fill={`url(#${lungId})`} stroke="#6993a3" strokeOpacity=".72" />
      <path d="M186 65C204 49 241 80 257 115 272 150 276 217 268 261 263 286 233 289 195 277 177 271 181 248 194 226 204 208 191 189 179 178L178 131C177 102 174 78 186 65Z" fill={`url(#${lungId})`} stroke="#6993a3" strokeOpacity=".72" />
      <ellipse cx="160" cy="164" rx="89" ry="105" fill={`url(#${hilumId})`} />
      <g fill="none" stroke="#eef9fa" strokeLinecap="round" strokeLinejoin="round">
        <path d="M160 31V125L131 156M160 125 191 157" strokeWidth="8" />
        <path d="M131 156 110 129 96 99M131 156 105 174 76 177M131 156 121 204 96 244M191 157 212 129 224 97M191 157 216 179 246 187M191 157 211 216 237 251" strokeWidth="3.5" />
        <g strokeWidth="1.5" opacity=".86">
          <path d="M110 129 84 128 69 142M110 129 116 101M105 174 82 156M105 174 88 206 67 221M121 204 131 241M96 244 73 263M96 244 103 269M212 129 235 123 249 141M212 129 207 96M216 179 239 164M216 179 232 210 257 225M211 216 207 248M237 251 250 266M237 251 231 274" />
          <path d="M84 128 77 109M88 206 66 199M116 101 125 86M131 241 125 264M235 123 244 106M232 210 253 204M207 96 198 80" />
        </g>
      </g>
      <g fill="none" stroke="#537e8d" strokeOpacity=".38">
        <path d="M59 165Q98 179 137 175M63 259Q110 204 140 186M184 173Q213 205 265 242" strokeWidth="1.5" />
        {Array.from({ length: 10 }, (_, index) => <path key={index} d={`M154 ${40 + index * 7}h12`} />)}
        <path d="M48 290Q94 267 140 286M185 286Q229 268 272 290" strokeWidth="2" />
      </g>

      {lesions.slice(0, 4).map((lesion, index) => {
        const point = LOBE_POINTS[lesion.lobe];
        const offset = index * 4;
        return (
          <g key={lesion.id} transform={`translate(${point.x + offset} ${point.y + offset})`} filter={`url(#lesion-shadow-${rawId})`}>
            <circle r="19" fill={accent.soft} fillOpacity=".46" stroke={accent.solid} strokeOpacity=".3" strokeWidth="1.5" />
            <circle r="11" fill="none" stroke={accent.solid} strokeOpacity=".62" strokeWidth="2">
              <animate attributeName="r" values="9;15;9" dur="2.8s" repeatCount="indefinite" />
              <animate attributeName="opacity" values=".8;.15;.8" dur="2.8s" repeatCount="indefinite" />
            </circle>
            <circle r="5.5" fill={accent.solid} stroke="#fff" strokeWidth="2" />
            <text x="0" y="-25" textAnchor="middle" fill="#334155" fontFamily="sans-serif" fontSize="11" fontWeight="700">
              {index + 1}
            </text>
            <title>{lesion.label}{lesion.diameterMm ? ` · ${lesion.diameterMm} mm` : ""}</title>
          </g>
        );
      })}

      <g fill="#668493" fontFamily="sans-serif" fontSize="10" letterSpacing="2">
        <text x="20" y="57">R</text><text x="293" y="57">L</text>
      </g>
    </svg>
  );
}
