import { signIn } from "@/auth";

export default function LoginPage() {
  return (
    <main>
      <form
        action={async () => {
          "use server";
          await signIn("google", { redirectTo: "/" });
        }}
      >
        <button type="submit">Google로 로그인</button>
      </form>
      <form
        action={async () => {
          "use server";
          await signIn("microsoft-entra-id", { redirectTo: "/" });
        }}
      >
        <button type="submit">Microsoft로 로그인</button>
      </form>
      <form
        action={async () => {
          "use server";
          await signIn("github", { redirectTo: "/" });
        }}
      >
        <button type="submit">GitHub로 로그인</button>
      </form>
    </main>
  );
}
