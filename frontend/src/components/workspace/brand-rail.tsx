import { SoomItMark, type SoomItTone } from "./soomit-mark";

export function BrandRail({ label, tone }: { label: string; tone: SoomItTone }) {
  return (
    <aside aria-label={label} className="sticky top-0 flex h-dvh w-[60px] shrink-0 flex-col items-center bg-[#17233F] px-1 py-3 lg:w-[76px]">
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 shadow-sm lg:h-11 lg:w-11" title="SoomIT">
        <SoomItMark tone={tone} />
      </div>
    </aside>
  );
}
