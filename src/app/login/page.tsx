import { signIn } from "@/auth";
import styles from "./login.module.css";

export default function LoginPage() {
  return (
    <main id="main" className={styles.page}>
      <h1 className={styles.title}>Artipin 로그인</h1>
      <div className={styles.providers}>
        <form
          action={async () => {
            "use server";
            await signIn("google", { redirectTo: "/" });
          }}
        >
          <button type="submit" className={styles.button}>
            Google로 로그인
          </button>
        </form>
        <form
          action={async () => {
            "use server";
            await signIn("github", { redirectTo: "/" });
          }}
        >
          <button type="submit" className={styles.button}>
            GitHub로 로그인
          </button>
        </form>
        {process.env.NODE_ENV === "development" && (
          <form
            action={async () => {
              "use server";
              await signIn("dev-login", { redirectTo: "/" });
            }}
          >
            <button type="submit" className={styles.button}>
              테스트 계정으로 로그인
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
