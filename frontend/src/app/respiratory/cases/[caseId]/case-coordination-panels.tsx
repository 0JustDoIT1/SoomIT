"use client";

import { useCallback, useEffect, useState } from "react";
import { useRespiratoryAuth } from "../../_components/respiratory-auth-provider";
import { createFollowUpPathologyOrder, fetchFollowUpPathologyOrderAvailability, type FollowUpPathologyOrderAvailability, type FollowUpPathologyOrderRequest, type FollowUpPathologyOrderResponse, type FollowUpPathologyTestType } from "../../_lib/respiratory-api";
import { getDecisionTypeLabel } from "./clinical-display-labels";

type ClinicianDecision = { source_stage: string; decision_type: string; target_stage: string | null; reason: string | null; decided_by: string; decided_at: string };
const TEST_LABELS: Record<FollowUpPathologyTestType, string> = { PDL1: "PD-L1 검사", GENE: "유전자 검사" };
const EMPTY_ORDER: FollowUpPathologyOrderRequest = { pathology_test_type: "PDL1", priority: "NORMAL", purpose: "", clinical_note: "" };

type CaseCoordinationPanelsProps = { caseId: string; decision?: ClinicianDecision | null; onOrderCreated?: () => void };

export function CaseCoordinationPanels(props: CaseCoordinationPanelsProps) {
  return <CaseCoordinationPanelsContent key={props.caseId} {...props} />;
}

function CaseCoordinationPanelsContent({ caseId, decision, onOrderCreated }: CaseCoordinationPanelsProps) {
  const { authorizedFetch } = useRespiratoryAuth();
  const [availability, setAvailability] = useState<FollowUpPathologyOrderAvailability | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [order, setOrder] = useState<FollowUpPathologyOrderRequest>(EMPTY_ORDER);
  const [isEditingOrder, setIsEditingOrder] = useState(false);
  const [isReviewing, setIsReviewing] = useState(false);
  const [createdOrder, setCreatedOrder] = useState<FollowUpPathologyOrderResponse | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const loadAvailability = useCallback(async () => {
    try {
      setAvailability(await fetchFollowUpPathologyOrderAvailability(authorizedFetch, caseId));
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "검사 오더 상태를 불러오지 못했습니다.");
    } finally { setLoading(false); }
  }, [authorizedFetch, caseId]);

  useEffect(() => {
    let active = true;
    void fetchFollowUpPathologyOrderAvailability(authorizedFetch, caseId)
      .then((result) => { if (active) setAvailability(result); })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : "검사 오더 상태를 불러오지 못했습니다."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [authorizedFetch, caseId]);

  async function submitOrder() {
    if (!order.purpose.trim()) { setError("검사 목적을 입력해 주세요."); setIsReviewing(false); return; }
    setCreating(true); setMessage(""); setError("");
    try {
      const result = await createFollowUpPathologyOrder(authorizedFetch, caseId, { ...order, purpose: order.purpose.trim(), clinical_note: order.clinical_note.trim() });
      setMessage(`${result.pathology_test_type_label} 오더가 생성되었습니다.`);
      setCreatedOrder(result);
      setOrder(EMPTY_ORDER); setIsEditingOrder(false); setIsReviewing(false);
      await loadAvailability();
      onOrderCreated?.();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "검사 오더 생성에 실패했습니다.");
    } finally { setCreating(false); }
  }

  const subtypeCompleted = availability?.subtype_review_completed ?? false;
  const hasActiveOrder = availability?.active_orders[order.pathology_test_type] ?? false;
  const canReview = !loading && subtypeCompleted && !hasActiveOrder && order.purpose.trim().length > 0;

  return <div className="mb-3 grid grid-cols-2 gap-3">
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <p className="text-xs font-semibold text-violet-700">호흡기내과 최종 판단</p>
      <h2 className="mt-1 text-base font-bold text-slate-900">단계 진행 결정</h2>
      {decision ? <dl className="mt-4 grid grid-cols-2 gap-3 bg-slate-50 p-4 text-xs">
        <DecisionValue label="검토 단계" value={decision.source_stage} /><DecisionValue label="진행 결정" value={getDecisionTypeLabel(decision.decision_type)} />
        <DecisionValue label="다음 단계" value={decision.target_stage || "-"} /><DecisionValue label="확정자" value={decision.decided_by || "-"} />
        <div className="col-span-2"><DecisionValue label="판단 근거" value={decision.reason || "-"} /></div>
        <div className="col-span-2"><DecisionValue label="확정 시각" value={formatDateTime(decision.decided_at)} /></div>
      </dl> : <p className="mt-4 bg-slate-50 px-4 py-6 text-center text-sm text-slate-400">저장된 진행 결정이 없습니다.</p>}
      <div className="mt-4 border-t border-slate-200 pt-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-bold text-slate-800">새 진행 결정</h3>
          <span className="whitespace-nowrap rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700">저장 API 연동 대기</span>
        </div>
        <p className="mt-1 text-xs leading-5 text-slate-500">일반 단계 결정 저장 API가 제공되면 다음 단계 진행·재검·전원·종결을 기록할 수 있습니다.</p>
        <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
          <label className="font-medium text-slate-500">진행 결정
            <select aria-label="진행 결정" disabled className="mt-1 w-full rounded-md border border-slate-200 bg-slate-100 px-3 py-2 text-slate-500">
              <option>결정 유형 선택</option>
              <option>다음 단계 진행</option><option>재검</option><option>전원</option><option>종결</option>
            </select>
          </label>
          <label className="font-medium text-slate-500">다음 단계
            <select aria-label="다음 단계" disabled className="mt-1 w-full rounded-md border border-slate-200 bg-slate-100 px-3 py-2 text-slate-500">
              <option>다음 단계 선택</option>
            </select>
          </label>
          <label className="col-span-2 font-medium text-slate-500">판단 근거
            <textarea aria-label="판단 근거" disabled rows={2} placeholder="저장 API 연동 후 입력할 수 있습니다." className="mt-1 w-full resize-none rounded-md border border-slate-200 bg-slate-100 px-3 py-2 text-slate-500" />
          </label>
          <div className="col-span-2 rounded-md border border-sky-100 bg-sky-50/60 p-3">
            <div className="flex items-center justify-between gap-3">
              <label htmlFor="patient-facing-summary" className="font-semibold text-sky-800">환자에게 보여줄 설명</label>
              <span className="whitespace-nowrap text-[10px] font-medium text-amber-700">환자 공개 API 연동 대기</span>
            </div>
            <p className="mt-1 text-[11px] leading-4 text-slate-500">내부 판단 근거와 분리된 쉬운 표현의 한 줄 안내입니다. 의료진 확정 전에는 환자에게 공개되지 않습니다.</p>
            <input id="patient-facing-summary" aria-label="환자에게 보여줄 설명" disabled maxLength={200} placeholder="예: 검사 결과와 치료 방향을 다음 진료 시 설명드리겠습니다." className="mt-2 w-full rounded-md border border-sky-100 bg-white/70 px-3 py-2 text-slate-500" />
            <div className="mt-2 flex items-center justify-between gap-3">
              <label className="flex items-center gap-2 text-[11px] text-slate-500"><input type="checkbox" aria-label="환자에게 공개" disabled />환자에게 공개</label>
              <span className="text-[10px] text-slate-400">최대 200자</span>
            </div>
          </div>
        </div>
        <button type="button" disabled className="mt-3 w-full rounded-md bg-slate-200 px-3 py-2.5 text-sm font-semibold text-slate-400">결정 저장</button>
      </div>
    </section>

    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <p className="text-xs font-semibold text-blue-700">추가 병리 검사</p>
      <h2 className="mt-1 text-base font-bold text-slate-900">검사 오더 작성</h2>
      <p className="mt-2 text-xs leading-5 text-slate-500">검사 종류와 요청 내용을 입력한 뒤 최종 검토하여 오더를 확정합니다.</p>
      {!loading && !subtypeCompleted ? <p className="mt-3 border-l-2 border-amber-400 bg-amber-50 px-3 py-2 text-xs text-amber-700">아형 분류 결과가 확정된 뒤 추가 검사를 요청할 수 있습니다.</p> : null}
      {message ? <p className="mt-3 bg-blue-50 px-3 py-2 text-xs text-blue-700">{message}</p> : null}
      {error ? <p role="alert" className="mt-3 bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p> : null}
      {createdOrder ? <dl aria-label="생성된 검사 오더" className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 rounded-md border border-emerald-200 bg-emerald-50/60 p-3 text-xs">
        <DecisionValue label="검사" value={createdOrder.pathology_test_type_label} />
        <DecisionValue label="상태" value={getOrderStatusLabel(createdOrder.order_status)} />
        <DecisionValue label="생성 시각" value={formatDateTime(createdOrder.created_at)} />
        <DecisionValue label="오더 ID" value={createdOrder.examination_order_id} />
      </dl> : null}
      {!isEditingOrder ? <button type="button" disabled={loading || !subtypeCompleted} onClick={() => setIsEditingOrder(true)} className="mt-4 w-full rounded-md border border-blue-200 bg-blue-50 px-3 py-2.5 text-sm font-semibold text-blue-700 hover:bg-blue-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400">오더 작성 시작</button> : <>
      <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
        <label className="font-medium text-slate-600">검사 종류<select aria-label="검사 종류" value={order.pathology_test_type} disabled={loading || creating || isReviewing} onChange={(event) => setOrder((current) => ({ ...current, pathology_test_type: event.target.value as FollowUpPathologyTestType }))} className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-slate-800"><option value="PDL1">PD-L1 검사</option><option value="GENE">유전자 검사</option></select></label>
        <label className="font-medium text-slate-600">우선순위<select aria-label="우선순위" value={order.priority} disabled={loading || creating || isReviewing} onChange={(event) => setOrder((current) => ({ ...current, priority: event.target.value as "NORMAL" | "URGENT" }))} className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-slate-800"><option value="NORMAL">일반</option><option value="URGENT">긴급</option></select></label>
        <label className="col-span-2 font-medium text-slate-600">검사 목적 <span className="text-red-500">*</span><input aria-label="검사 목적" value={order.purpose} disabled={creating || isReviewing} maxLength={500} onChange={(event) => setOrder((current) => ({ ...current, purpose: event.target.value }))} placeholder="검사를 요청하는 목적을 입력하세요." className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-slate-800" /></label>
        <label className="col-span-2 font-medium text-slate-600">임상 소견<textarea aria-label="임상 소견" value={order.clinical_note} disabled={creating || isReviewing} rows={2} maxLength={1000} onChange={(event) => setOrder((current) => ({ ...current, clinical_note: event.target.value }))} placeholder="검사에 참고할 임상 소견을 입력하세요." className="mt-1 w-full resize-none rounded-md border border-slate-200 px-3 py-2 text-slate-800" /></label>
      </div>
      {hasActiveOrder ? <p className="mt-3 text-xs text-amber-700">동일 종류의 미완료 오더가 이미 있어 중복 요청할 수 없습니다.</p> : null}
      {isReviewing ? <div className="mt-4 rounded-md border border-blue-200 bg-blue-50 p-3 text-xs text-slate-700">
        <p className="font-bold text-blue-800">오더 최종 확인</p>
        <dl className="mt-2 grid grid-cols-[80px_1fr] gap-x-2 gap-y-1"><dt className="text-slate-500">Case</dt><dd className="break-all">{caseId}</dd><dt className="text-slate-500">검사</dt><dd>{TEST_LABELS[order.pathology_test_type]}</dd><dt className="text-slate-500">우선순위</dt><dd>{order.priority === "URGENT" ? "긴급" : "일반"}</dd><dt className="text-slate-500">검사 목적</dt><dd>{order.purpose.trim()}</dd><dt className="text-slate-500">임상 소견</dt><dd>{order.clinical_note.trim() || "-"}</dd></dl>
        <div className="mt-3 flex justify-end gap-2"><button type="button" disabled={creating} onClick={() => setIsReviewing(false)} className="rounded-md border border-slate-300 bg-white px-3 py-2 font-semibold">수정</button><button type="button" disabled={creating} onClick={() => void submitOrder()} className="rounded-md bg-blue-600 px-3 py-2 font-semibold text-white disabled:bg-slate-300">{creating ? "생성 중..." : "오더 확정"}</button></div>
      </div> : <div className="mt-4 flex gap-2"><button type="button" onClick={() => { setOrder(EMPTY_ORDER); setError(""); setIsEditingOrder(false); }} className="rounded-md border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600">취소</button><button type="button" disabled={!canReview} onClick={() => { setError(""); setIsReviewing(true); }} className="flex-1 rounded-md bg-blue-600 px-3 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400">입력 내용 검토</button></div>}
      </>}
    </section>
  </div>;
}

function DecisionValue({ label, value }: { label: string; value: string }) { return <div><dt className="text-slate-400">{label}</dt><dd className="mt-1 font-semibold text-slate-700">{value}</dd></div>; }
function formatDateTime(value: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? value : date.toLocaleString("ko-KR"); }
function getOrderStatusLabel(value: string) { return ({ ORDERED: "요청됨", SCHEDULED: "예약됨", COMPLETED: "완료", CANCELLED: "취소됨" } as Record<string, string>)[value] ?? value; }
