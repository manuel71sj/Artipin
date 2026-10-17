import NextAuth, { type DefaultSession } from "next-auth";
import GitHub from "next-auth/providers/github";
import Google from "next-auth/providers/google";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";
import { db } from "@/db";
import { owners } from "@/db/schema";

declare module "next-auth" {
  interface Session {
    user: { id: string } & DefaultSession["user"];
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  providers: [Google, MicrosoftEntraID, GitHub],
  pages: { signIn: "/login" },
  callbacks: {
    async jwt({ token, user, account }) {
      // account는 로그인 직후 한 번만 들어온다 → 이때 owners에 upsert
      if (account) {
        const email = user.email ?? null;
        const name = user.name ?? user.email ?? account.providerAccountId;
        const [owner] = await db
          .insert(owners)
          .values({
            provider: account.provider,
            providerAccountId: account.providerAccountId,
            email,
            name,
          })
          .onConflictDoUpdate({
            target: [owners.provider, owners.providerAccountId],
            set: { email, name },
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
