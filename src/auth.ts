import NextAuth, { type DefaultSession } from "next-auth";
import Google from "next-auth/providers/google";
import { db } from "@/db";
import { owners } from "@/db/schema";

declare module "next-auth" {
  interface Session {
    user: { id: string } & DefaultSession["user"];
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  providers: [
    // hd 파라미터는 계정 선택 화면 힌트일 뿐이다. 실제 검증은 signIn 콜백이 한다.
    Google({
      authorization: { params: { hd: process.env.AUTH_ALLOWED_DOMAIN } },
    }),
  ],
  pages: { signIn: "/login" },
  callbacks: {
    signIn({ profile }) {
      const domain = process.env.AUTH_ALLOWED_DOMAIN;
      return Boolean(
        domain && profile?.email_verified === true && profile.hd === domain,
      );
    },
    async jwt({ token, profile }) {
      // profile은 로그인 직후 한 번만 들어온다 → 이때 owners에 upsert
      if (profile?.email) {
        const [owner] = await db
          .insert(owners)
          .values({ email: profile.email, name: profile.name ?? profile.email })
          .onConflictDoUpdate({
            target: owners.email,
            set: { name: profile.name ?? profile.email },
          })
          .returning({ id: owners.id });
        token.id = String(owner.id);
      }
      return token;
    },
    session({ session, token }) {
      session.user.id = token.id as string;
      return session;
    },
  },
});
