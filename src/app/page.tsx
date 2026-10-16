import { redirect } from "next/navigation";
import { auth, signOut } from "@/auth";

export default async function Home() {
  const session = await auth();
  if (!session) redirect("/login");

  return (
    <main>
      <p>{session.user.email}</p>
      <form
        action={async () => {
          "use server";
          await signOut({ redirectTo: "/login" });
        }}
      >
        <button type="submit">로그아웃</button>
      </form>
    </main>
  );
}
