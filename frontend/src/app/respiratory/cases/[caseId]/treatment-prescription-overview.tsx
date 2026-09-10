type TreatmentSummary = {
  treatment_type_label: string | null;
  selected_regimen_detail: { regimen_name: string } | null;
} | null;

type PrescriptionSummary = {
  id: string;
  prescription_status: string;
  safety_check_results: { result: "PASS" | "WARNING" | "BLOCK" }[];
};

export function TreatmentPrescriptionOverview({ treatment, prescriptions }: { treatment: TreatmentSummary; prescriptions: PrescriptionSummary[] }) {
  const warningCount = prescriptions.reduce((count, item) => count + item.safety_check_results.filter((result) => result.result === "WARNING").length, 0);
  const blockCount = prescriptions.reduce((count, item) => count + item.safety_check_results.filter((result) => result.result === "BLOCK").length, 0);
  const finalCount = prescriptions.filter((item) => item.prescription_status === "FINAL").length;

  return (
    <section className="mb-3 overflow-hidden rounded-lg border border-slate-200 bg-white">
      <header className="flex h-9 items-center justify-between border-b border-slate-200 px-4">
        <h2 className="text-xs font-bold text-slate-900">치료·처방 현황</h2>
        <p className="text-[10px] text-slate-400">확정 치료안과 실제 처방 상태를 함께 확인합니다.</p>
      </header>
      <div className="grid grid-cols-4 divide-x divide-slate-200 bg-slate-50/50">
        <Summary label="치료 유형" value={treatment?.treatment_type_label} />
        <Summary label="선택 치료요법" value={treatment?.selected_regimen_detail?.regimen_name} />
        <Summary label="처방 상태" value={prescriptions.length > 0 ? `전체 ${prescriptions.length}건 · 최종 ${finalCount}건` : undefined} />
        <Summary label="안전성 확인" value={blockCount > 0 ? `차단 ${blockCount}건` : warningCount > 0 ? `경고 ${warningCount}건` : prescriptions.length > 0 ? "차단·경고 없음" : undefined} tone={blockCount > 0 ? "danger" : warningCount > 0 ? "warning" : "default"} />
      </div>
    </section>
  );
}

function Summary({ label, value, tone = "default" }: { label: string; value?: string | null; tone?: "default" | "warning" | "danger" }) {
  const color = tone === "danger" ? "text-rose-700" : tone === "warning" ? "text-amber-700" : "text-slate-700";
  return <div className="min-w-0 px-4 py-2.5"><p className="whitespace-nowrap text-[10px] text-slate-400">{label}</p><p className={`mt-1 truncate text-xs font-bold ${color}`}>{value || "-"}</p></div>;
}
