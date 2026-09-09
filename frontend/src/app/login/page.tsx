import LoginForm from "@/components/auth/LoginForm";
import styles from "@/components/auth/LoginForm.module.css";

export default function LoginPage() {
  return (
    <main className={styles.page}>
      <div className={styles.container}>
        <div className={styles.brand}>
          <h1 className={styles.title}>
            숨잇
          </h1>

          <p className={styles.subtitle}>
            Lung Cancer CDSS Platform
          </p>
        </div>

        <section className={styles.card}>
          <h2 className={styles.cardTitle}>
            로그인
          </h2>

          <p className={styles.description}>
            병원 업무 시스템에 로그인해주세요.
          </p>

          <LoginForm />
        </section>
      </div>
    </main>
  );
}