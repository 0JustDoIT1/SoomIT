"use client";

import { useCallback, useEffect, useState } from "react";
import { useRespiratoryAuth } from "../../_components/respiratory-auth-provider";
import {
  createFollowUpPathologyOrder,
  fetchFollowUpPathologyOrderAvailability,
  type FollowUpPathologyOrderAvailability,
  type FollowUpPathologyTestType,
} from "../../_lib/respiratory-api";
import { getDecisionTypeLabel } from "./clinical-display-labels";

type ClinicianDecision = {
  source_stage: string;
  decision_type: string;
  target_stage: string | null;
  reason: string | null;
  decided_by: string;
  decided_at: string;
};

export function CaseCoordinationPanels({ caseId, decision, onOrderCreated }: {
  caseId: string;
  decision?: ClinicianDecision | null;
  onOrderCreated?: () => void;
}) {
  const { authorizedFetch } = useRespiratoryAuth();
  const [availability, setAvailability] = useState<FollowUpPathologyOrderAvailability | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState<FollowUpPathologyTestType | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const loadAvailability = useCallback(async () => {
    try {
      setAvailability(await fetchFollowUpPathologyOrderAvailability(authorizedFetch, caseId));
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "검사 처방 상태를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [authorizedFetch, caseId]);

  useEffect(() => {
    let active = true;
    void fetchFollowUpPathologyOrderAvailability(authorizedFetch, caseId)
      .then((result) => {
        if (!active) return;
        setAvailability(result);
        setError("");
      })
      .catch((reason: unknown) => {
        if (!active) return;
        setError(reason instanceof Error ? reason.message : "검사 처방 상태를 불러오지 못했습니다.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [authorizedFetch, caseId]);

  async function createOrder(testType: FollowUpPathologyTestType) {
    setCreating(testType);
    setMessage("");
    setError("");
    try {
      const result = await createFollowUpPathologyOrder(authorizedFetch, caseId, testType);
      setMessage(`${result.pathology_test_type_label} 오더가 생성되었습니다.`);
      await loadAvailability();
      onOrderCreated?.();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "검사 오더 생성에 실패했습니다.");
    } finally {
      setCreating(null);
    }
  }

  const subtypeCompleted = availability?.subtype_review_completed ?? false;

  return (
    <div className="mb-3 grid grid-cols-2 gap-3">
      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <p className="text-xs font-semibold text-violet-700">호흡기내과 최종 판단</p>
        <h2 className="mt-1 text-base font-bold text-slate-900">단계 진행 결정</h2>
        {decision ? (
          <dl className="mt-4 grid grid-cols-2 gap-3 bg-slate-50 p-4 text-xs">
            <DecisionValue label="검사 단계" value={decision.source_stage} />
            <DecisionValue label="진행 결정" value={getDecisionTypeLabel(decision.decision_type)} />
            <DecisionValue label="다음 단계" value={decision.target_stage || "-"} />
            <DecisionValue label="확정자" value={decision.decided_by || "-"} />
            <div className="col-span-2"><DecisionValue label="판단 근거" value={decision.reason || "-"} /></div>
            <div className="col-span-2"><DecisionValue label="확정 시각" value={formatDateTime(decision.decided_at)} /></div>
          </dl>
        ) : <p className="mt-4 bg-slate-50 px-4 py-6 text-center text-sm text-slate-400">저장된 진행 결정이 없습니다.</p>}
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <p className="text-xs font-semibold text-blue-700">추가 병리 검사</p>
        <h2 className="mt-1 text-base font-bold text-slate-900">검사 오더</h2>
        <p className="mt-2 text-xs leading-5 text-slate-500">SUBTYPE 판독 완료 후 PD-L1 검사와 유전자 검사를 각각 독립적으로 처방할 수 있습니다.</p>
        {!loading && !subtypeCompleted ? <p className="mt-3 border-l-2 border-amber-400 bg-amber-50 px-3 py-2 text-xs text-amber-700">아형분류 판독 완료 후 추가 검사를 처방할 수 있습니다.</p> : null}
        {message ? <p className="mt-3 bg-blue-50 px-3 py-2 text-xs text-blue-700">{message}</p> : null}
        {error ? <p className="mt-3 bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p> : null}
        <div className="mt-4 grid grid-cols-2 gap-2">
          {(["PDL1", "GENE"] as const).map((testType) => {
            const hasActiveOrder = availability?.active_orders[testType] ?? false;
            return (
              <button key={testType} type="button"
                disabled={loading || !subtypeCompleted || hasActiveOrder || creating !== null}
                onClick={() => void createOrder(testType)}
                className="rounded-lg bg-blue-600 px-3 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400">
                {creating === testType ? "생성 중..." : testType === "PDL1" ? "PD-L1 검사 오더" : "유전자 검사 오더"}
              </button>
            );
          })}
        </div>
        {availability?.active_orders.PDL1 ? <p className="mt-2 text-[11px] text-slate-500">PD-L1 미완료 오더가 이미 있습니다.</p> : null}
        {availability?.active_orders.GENE ? <p className="mt-1 text-[11px] text-slate-500">유전자 검사 미완료 오더가 이미 있습니다.</p> : null}
      </section>
    </div>
  );
}

function DecisionValue({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-slate-400">{label}</dt><dd className="mt-1 font-semibold text-slate-700">{value}</dd></div>;
}

function formatDateTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("ko-KR");
}
