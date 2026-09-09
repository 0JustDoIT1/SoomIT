import { StateMessage } from "@/components/workspace/state-message";
import { StatusBadge } from "@/components/workspace/status-badge";

export type RadiologyWorklistItem = {
  id: string;
  caseId?: string;
  patientName: string;
  patientCode: string;
  patientBirthDate?: string;
  patientSex?: string;
  examType: string;
  priority: string;
  priorityLabel?: string;
  status: string;
  statusLabel?: string;
  scheduledAt?: string;
  doctorName?: string;
  purpose?: string;
  currentStage: "XRAY" | "CT" | "PATHOLOGY" | "STAGING" | "GENE" | "TREATMENT" | "PRESCRIPTION" | null;
};

type RadiologyWorklistProps = {
  items: RadiologyWorklistItem[];
  selectedId: string | null;
  onSelect: (item: RadiologyWorklistItem) => void;
};

export function RadiologyWorklist({ items, selectedId, onSelect }: RadiologyWorklistProps) {
  return (
    <section aria-labelledby="worklist-heading" className="min-w-0">
      <div className="flex h-14 items-center border-b border-slate-200 px-5">
        <h2 id="worklist-heading" className="text-sm font-bold text-slate-800">영상 검사 Worklist</h2>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[880px] border-collapse text-left text-sm">
          <thead className="bg-slate-50 text-xs font-semibold text-slate-500">
            <tr className="border-b border-slate-200">
              <th className="px-4 py-3">환자명</th>
              <th className="px-4 py-3">환자코드</th>
              <th className="px-4 py-3">검사 종류</th>
              <th className="px-4 py-3">우선순위</th>
              <th className="px-4 py-3">현재 상태</th>
              <th className="px-4 py-3">검사 예정 시각</th>
              <th className="px-4 py-3">담당 의사</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr
                key={item.id}
                className={`cursor-pointer border-b border-slate-100 hover:bg-cyan-50/50 ${selectedId === item.id ? "bg-cyan-50" : "bg-white"}`}
                onClick={() => onSelect(item)}
              >
                <td className="px-4 py-3 font-semibold text-slate-800">{item.patientName}</td>
                <td className="px-4 py-3 text-slate-600">{item.patientCode}</td>
                <td className="px-4 py-3 text-slate-700">{item.examType}</td>
                <td className="px-4 py-3"><StatusBadge status={item.priority} label={item.priorityLabel} /></td>
                <td className="px-4 py-3"><StatusBadge status={item.status} label={item.statusLabel} /></td>
                <td className="px-4 py-3 text-slate-600">{item.scheduledAt ?? "-"}</td>
                <td className="px-4 py-3 text-slate-600">{item.doctorName ?? "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {items.length === 0 ? (
        <StateMessage
          variant="empty"
          title="표시할 영상 검사 항목이 없습니다."
          description="방사선사 Worklist API가 연결되면 환자별 영상 검사 오더가 표시됩니다."
          className="m-5"
        />
      ) : null}
    </section>
  );
}
