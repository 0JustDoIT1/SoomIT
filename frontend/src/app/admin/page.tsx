import { AdminLoginPanel } from "./admin-login-panel";

export default function AdminLoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-7 text-center">
          <h1 className="text-3xl font-black text-blue-800">숨잇</h1>
          <p className="mt-2 text-sm text-slate-500">Administration Console</p>
        </div>
        <section className="border border-slate-200 bg-white p-8 shadow-sm">
          <h2 className="text-xl font-bold text-slate-900">관리자 로그인</h2>
          <p className="mb-6 mt-2 text-sm text-slate-500">
            병원 및 관리자 계정을 관리합니다.
          </p>
          <AdminLoginPanel />
        </section>
      </div>
    </main>
  );
}
