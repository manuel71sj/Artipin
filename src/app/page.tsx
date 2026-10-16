import { and, desc, eq, isNull } from "drizzle-orm";
import { redirect } from "next/navigation";
import { auth, signOut } from "@/auth";
import { db } from "@/db";
import { files } from "@/db/schema";
import { appOrigin } from "@/lib/hosts";
import { FileActions } from "./_components/file-actions";
import { UploadForm } from "./_components/upload-form";

export default async function Home() {
  const session = await auth();
  if (!session) redirect("/login");

  const myFiles = await db
    .select()
    .from(files)
    .where(
      and(eq(files.ownerId, Number(session.user.id)), isNull(files.deletedAt)),
    )
    .orderBy(desc(files.createdAt), desc(files.id));
  const origin = appOrigin();

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

      <UploadForm />

      <table>
        <thead>
          <tr>
            <th>제목</th>
            <th>종류</th>
            <th>올린 시각</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {myFiles.map((f) => (
            <tr key={f.id}>
              <td>{f.title}</td>
              <td>{f.kind === "image" ? "이미지" : "HTML"}</td>
              <td>
                {new Date(f.createdAt).toLocaleString("ko-KR", {
                  timeZone: "Asia/Seoul",
                })}
              </td>
              <td>
                <FileActions id={f.id} link={`${origin}/s/${f.shareToken}`} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
