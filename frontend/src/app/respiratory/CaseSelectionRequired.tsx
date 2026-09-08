import Link from "next/link";

type CaseSelectionRequiredProps = {
  title: string;
  description: string;
};

export default function CaseSelectionRequired({
  title,
  description,
}: CaseSelectionRequiredProps) {
  return (
    <div className="flex min-h-[520px] items-center justify-center">
      <div className="w-full max-w-xl rounded-3xl border border-emerald-100 bg-white px-10 py-12 text-center shadow-sm">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-2xl">
          +
        </div>

        <h1 className="mt-5 text-2xl font-bold text-slate-800">
          {title}
        </h1>

        <p className="mt-3 text-sm leading-6 text-slate-500">
          {description}
        </p>

        <div className="mt-7">
          <Link
            href="/respiratory/cases"
            className="inline-flex rounded-xl bg-emerald-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700"
          >
            담당 Case 선택하기
          </Link>
        </div>

        <p className="mt-4 text-xs text-slate-400">
          환자를 선택하면 해당 Case의 임상 정보를 확인할 수 있습니다.
        </p>
      </div>
    </div>
  );
}