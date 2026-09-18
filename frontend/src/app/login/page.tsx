import Image from "next/image";

import LoginForm from "@/components/auth/LoginForm";
import styles from "@/components/auth/LoginForm.module.css";

export default function LoginPage() {
  return (
    <main className={styles.page}>
      <div className={styles.backgroundOrb} aria-hidden="true" />
      <div className={styles.backgroundOrbSmall} aria-hidden="true" />
      <div className={styles.backgroundWave} aria-hidden="true" />
      <div className={styles.backgroundWaveSecondary} aria-hidden="true" />

      <div className={styles.container}>
        <section className={styles.brand}>
          <div className={styles.logoWrap}>
            <Image
              className={styles.logo}
              src="/images/logo_full.png"
              alt="숨-잇"
              width={1254}
              height={1254}
              priority
            />
          </div>

          <p className={styles.subtitle}>
            Lung Cancer CDSS Platform
          </p>
        </section>

        <section className={styles.card}>
          <h2 className={styles.cardTitle}>
            의료진 로그인
          </h2>

          <p className={styles.description}>
            숨잇 의료진 서비스를 이용하려면 로그인해주세요.
          </p>

          <LoginForm />
        </section>
      </div>
    </main>
  );
}
