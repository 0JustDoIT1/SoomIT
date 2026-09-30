export type SoomItTone = "teal" | "violet" | "pink" | "pathology";

export function SoomItMark({ tone = "teal" }: { tone?: SoomItTone }) {
  const pink = tone === "pink";
  const pathology = tone === "pathology";
  const violet = tone === "violet" || pathology;
  const id = tone === "teal" ? "soomit" : `${tone}-soomit`;
  const backgroundStart = pink ? "#C9829B" : pathology ? "#6F63B5" : violet ? "#7164a8" : "#1b7883";
  const backgroundEnd = pink ? "#8F536E" : pathology ? "#474276" : violet ? "#433b75" : "#0d4d59";
  const line = pink ? "#F2C7D5" : pathology ? "#D2CCF2" : violet ? "#c4b5fd" : "#73e1d5";
  const lineHighlight = pink ? "#FFF0F5" : pathology ? "#F1EFFF" : violet ? "#e9e2ff" : "#a7fff3";
  const stroke = pink ? "#F3CBD8" : pathology ? "#D8D3F3" : violet ? "#d8ccff" : "#8ee9df";
  const circleStroke = pink ? "#FFF0F5" : pathology ? "#F1EFFF" : violet ? "#eee7ff" : "#b9fff7";
  const text = pink ? "#FFF9FB" : violet ? "#faf8ff" : "#f4fffd";
  return (
    <svg role="img" aria-label="SoomIT" viewBox="0 0 40 40" className="h-9 w-9 drop-shadow-[0_4px_8px_rgba(0,0,0,0.18)] lg:h-10 lg:w-10">
      <defs>
        <linearGradient id={`${id}-mark-bg`} x1="7" y1="5" x2="33" y2="35" gradientUnits="userSpaceOnUse">
          <stop stopColor={backgroundStart} />
          <stop offset="1" stopColor={backgroundEnd} />
        </linearGradient>
        <linearGradient id={`${id}-breath-line`} x1="6" y1="0" x2="34" y2="0" gradientUnits="userSpaceOnUse">
          <stop stopColor={line} stopOpacity=".45" />
          <stop offset=".5" stopColor={lineHighlight} />
          <stop offset="1" stopColor={line} stopOpacity=".45" />
        </linearGradient>
      </defs>
      <rect x="1.5" y="1.5" width="37" height="37" rx="11" fill={`url(#${id}-mark-bg)`} stroke={stroke} strokeOpacity=".3" />
      <circle cx="20" cy="19" r="12.5" fill="none" stroke={circleStroke} strokeOpacity=".1" />
      <text x="20" y="24.3" textAnchor="middle" fill={text} fontFamily="Arial, sans-serif" fontSize="19" fontWeight="700" letterSpacing="-.8">S</text>
      <path d="M6.5 28c3.1 0 3.3-3.3 5.7-3.3s2.8 3.3 5.3 3.3 2.8-3.3 5.3-3.3 2.8 3.3 5.3 3.3 2.7-3.3 5.4-3.3" fill="none" stroke={`url(#${id}-breath-line)`} strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
