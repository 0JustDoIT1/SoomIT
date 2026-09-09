import { StateMessage } from "@/components/workspace/state-message";

export default function RadiologyHistoryPage() {
  return (
    <div className="p-4 sm:p-6 xl:p-8">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">완료 기록</h1>
      <StateMessage
        variant="unsupported"
        title="완료 기록 화면을 준비 중입니다."
        description="방사선사 Worklist 완료 기록 API가 아직 연결되지 않았습니다."
        className="mt-5 max-w-3xl"
      />
    </div>
  );
}
