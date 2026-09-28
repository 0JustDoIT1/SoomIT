import Image from "next/image";
import Link from "next/link";

import loginStyles from "@/components/auth/LoginForm.module.css";
import { AdminLoginPanel } from "./admin-login-panel";
import styles from "./admin-login.module.css";

export default function AdminLoginPage() {
  return (
    <main className={loginStyles.page}>
      <svg className={loginStyles.backgroundWave} viewBox="0 0 1440 240" preserveAspectRatio="none" aria-hidden="true" focusable="false">
        <path d="M0 30 C260 -20 440 210 800 160 S1220 30 1440 60 V240 H0Z" fill="rgba(45, 212, 191, 0.07)" />
        <path d="M0 110 C300 20 530 240 880 195 S1260 75 1440 100 V240 H0Z" fill="rgba(96, 165, 250, 0.12)" />
        <path d="M0 210 C280 30 450 130 700 220 S1190 170 1440 180 V240 H0Z" fill="rgba(59, 130, 246, 0.08)" />
        <path d="M0 30 C260 -20 440 210 800 160 S1220 30 1440 60 M0 210 C280 30 450 130 700 220 S1190 170 1440 180" fill="none" stroke="#ffffff" strokeOpacity=".7" />
      </svg>

      <div className={loginStyles.container}>
        <section className={loginStyles.brand}>
          <svg className={loginStyles.breathLines} viewBox="0 0 1000 400" fill="none" aria-hidden="true" focusable="false">
            <defs>
              <linearGradient id="admin-login-breath" x1="0" y1="0" x2="1000" y2="0" gradientUnits="userSpaceOnUse">
                <stop stopColor="rgb(45, 212, 191)" stopOpacity=".28" />
                <stop offset=".3" stopColor="rgb(45, 212, 191)" stopOpacity=".4" />
                <stop offset=".55" stopColor="rgb(96, 165, 250)" stopOpacity=".10" />
                <stop offset=".8" stopColor="rgb(96, 165, 250)" stopOpacity=".35" />
                <stop offset="1" stopColor="rgb(96, 165, 250)" stopOpacity="0" />
              </linearGradient>
            </defs>
            <g stroke="url(#admin-login-breath)" strokeWidth=".85">
              {Array.from({ length: 7 }, (_, line) => (
                <path
                  key={line}
                  className={loginStyles.breathLine}
                  style={{ animationDelay: `${-line * 0.4}s` }}
                  d={`M-60 ${95 + line * 10} C110 ${70 + line * 8} 190 290 330 ${265 + line * 6} S510 ${130 + line * 4} 680 240 S860 ${335 - line * 4} 1060 ${245 - line * 6}`}
                />
              ))}
            </g>
          </svg>
          <div className={loginStyles.logoWrap}>
            <Image
              className={loginStyles.logo}
              src="/images/logo_full.png"
              alt="숨-잇"
              width={1254}
              height={1254}
              priority
            />

          </div>
          <p className={loginStyles.subtitle}>Lung Cancer CDSS Platform</p>
        </section>

        <section className={loginStyles.card}>
          <h1 className={loginStyles.cardTitle}>관리자 로그인</h1>
          <p className={loginStyles.description}>승인된 관리자 계정으로 로그인해주세요.</p>
          <AdminLoginPanel />
          <p className={loginStyles.notice}>안전한 의료 데이터 보호를 위해 관리자 접속 권한을 확인합니다.</p>
          <Link href="/login" className={styles.staffLoginLink}>의료진 로그인으로 이동 →</Link>
        </section>
      </div>
    </main>
  );
}
