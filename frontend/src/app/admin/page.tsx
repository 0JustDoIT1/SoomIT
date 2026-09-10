import Link from "next/link";
import { AdminLoginPanel } from "./admin-login-panel";
import styles from "./admin-login.module.css";

export default function AdminLoginPage() {
  return (
    <main className={styles.page}>
      <div className={styles.overlay} />

      <header className={styles.header}>
        <div className={styles.brand}>
          <span className={styles.logo}>숨잇</span>

          <span className={styles.brandDivider} />

          <span className={styles.brandDescription}>
            Lung Cancer
            <br />
            CDSS Platform
          </span>
        </div>

        <Link href="/login" className={styles.staffLoginLink}>
          일반 로그인
          <span className={styles.arrow}>→</span>
        </Link>
      </header>

      <section className={styles.loginArea}>
        <div className={styles.loginContainer}>
          <div className={styles.securityIcon} aria-hidden="true">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <path d="M12 3 5 6v5c0 4.8 2.8 8 7 10 4.2-2 7-5.2 7-10V6l-7-3Z" />
              <rect x="9" y="10" width="6" height="5" rx="1" />
              <path d="M10.5 10V8.8a1.5 1.5 0 0 1 3 0V10" />
            </svg>
          </div>

          <h1 className={styles.title}>
            <span>ADMIN</span> LOGIN
          </h1>

          <div className={styles.description}>
            <p>관리자 전용 페이지입니다.</p>
            <p>승인된 계정으로만 접속할 수 있습니다.</p>
          </div>

          <AdminLoginPanel />
        </div>
      </section>
    </main>
  );
}