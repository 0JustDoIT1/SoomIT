import Link from "next/link";
import Image from "next/image";
import { AdminLoginPanel } from "./admin-login-panel";
import styles from "./admin-login.module.css";

export default function AdminLoginPage() {
  return (
    <main className={styles.page}>
      <div className={styles.backgroundOrb} aria-hidden="true" />
      <div className={styles.backgroundOrbSmall} aria-hidden="true" />
      <div className={styles.backgroundWave} aria-hidden="true" />
      <div className={styles.backgroundWaveSecondary} aria-hidden="true" />

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
        <div className={styles.content}>
          <div className={styles.brandHero}>
            <Image
              className={styles.brandImage}
              src="/images/logo_full.png"
              alt="숨-잇"
              width={1254}
              height={1254}
              priority
            />

            <div className={styles.brandFooter}>
              <strong>더 나은 진단, 더 건강한 내일</strong>
              <span>LUNG CANCER CLINICAL DECISION SUPPORT SYSTEM</span>
            </div>
          </div>

          <div className={styles.loginContainer}>
            <h1 className={styles.title}>관리자 로그인</h1>

            <div className={styles.description}>
              <p>관리자 전용 페이지입니다.</p>
              <p>승인된 계정으로만 접속할 수 있습니다.</p>
            </div>

            <AdminLoginPanel />

            <div className={styles.securityNotice}>
              <strong>이 서비스는 의료진 전용 서비스입니다.</strong>
              <p>안전한 의료 데이터 보호를 위해 최선을 다하고 있습니다.</p>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
