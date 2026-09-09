"use client";

import { useState } from "react";

import { RadiologyDetail } from "./_components/radiology-detail";
import { RadiologyWorklist, type RadiologyWorklistItem } from "./_components/radiology-worklist";

const worklistItems: RadiologyWorklistItem[] = [];

export default function RadiologyWorklistPage() {
  const [selectedItem, setSelectedItem] = useState<RadiologyWorklistItem | null>(null);

  return (
    <div className="p-4 sm:p-6 xl:p-8">
      <div className="mb-5">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-700">Radiology</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">Worklist</h1>
      </div>

      <div className="grid overflow-hidden border-y border-slate-200 bg-white xl:grid-cols-[minmax(0,1.35fr)_minmax(380px,0.65fr)] xl:divide-x xl:divide-slate-200">
        <RadiologyWorklist
          items={worklistItems}
          selectedId={selectedItem?.id ?? null}
          onSelect={setSelectedItem}
        />
        <RadiologyDetail item={selectedItem} />
      </div>
    </div>
  );
}
