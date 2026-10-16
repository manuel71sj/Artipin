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
    </main>
  );
}
