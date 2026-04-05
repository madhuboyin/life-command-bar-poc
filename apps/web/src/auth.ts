import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "./lib/prisma";
import { createApiAccessToken } from "./lib/auth/api-access-token";
import { logAuthEvent } from "./lib/auth/auth-observability";

function resolveAuthSecret() {
  const value = (process.env.AUTH_SECRET || "").trim();
  if (value.length >= 32) return value;
  if (process.env.NODE_ENV === "production") {
    throw new Error("AUTH_SECRET is required and must be at least 32 characters in production.");
  }
  return "dev-auth-secret-change-me-in-production-123456";
}

const authSecret = resolveAuthSecret();
const apiAuthTokenSecret = resolveApiAuthTokenSecret(authSecret);

function shouldRefreshToken(expiresAtEpoch?: number) {
  if (!expiresAtEpoch) return true;
  const now = Math.floor(Date.now() / 1000);
  return expiresAtEpoch - now < 5 * 60;
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: {
    strategy: "jwt"
  },
  secret: authSecret,
  trustHost: true,
  pages: {
    signIn: "/signin"
  },
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID ?? "",
      clientSecret: process.env.AUTH_GOOGLE_SECRET ?? "",
      authorization: {
        params: {
          scope: "openid email profile"
        }
      }
    })
  ],
  callbacks: {
    async signIn({ user, account }) {
      await logAuthEvent({
        userId: user.id ?? null,
        eventType: "auth_sign_in_started",
        metadata: {
          provider: account?.provider ?? null
        }
      });

      if (!user.email) {
        await logAuthEvent({
          userId: null,
          eventType: "auth_sign_in_failed",
          metadata: {
            reason: "missing_user_email",
            provider: account?.provider ?? null
          }
        });
        return false;
      }

      if (account?.provider !== "google") {
        await logAuthEvent({
          userId: user.id,
          eventType: "auth_sign_in_failed",
          metadata: {
            reason: "unsupported_provider",
            provider: account?.provider ?? null
          }
        });
        return false;
      }

      return true;
    },
    async jwt({ token, user }) {
      let userId = user?.id ?? token.sub;
      const email = user?.email ?? token.email;

      if (!userId && email) {
        const existing = await prisma.user.findUnique({
          where: {
            email
          },
          select: {
            id: true
          }
        });
        userId = existing?.id;
      }

      if (!userId || !email) {
        return token;
      }

      if (
        !token.apiAccessToken ||
        shouldRefreshToken(typeof token.apiAccessTokenExpiresAt === "number" ? token.apiAccessTokenExpiresAt : undefined)
      ) {
        const issued = createApiAccessToken(
          {
            userId,
            email
          },
          apiAuthTokenSecret
        );
        token.apiAccessToken = issued.token;
        token.apiAccessTokenExpiresAt = issued.expiresAtEpoch;
      }

      token.sub = userId;
      token.email = email;
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.sub) {
        session.user.id = token.sub;
      }
      session.apiAccessToken =
        typeof token.apiAccessToken === "string" ? token.apiAccessToken : null;
      return session;
    }
  },
  events: {
    async signIn(message) {
      const userId = message.user.id;
      if (!userId) return;
      await logAuthEvent({
        userId,
        eventType: "auth_sign_in_succeeded",
        metadata: {
          provider: message.account?.provider ?? null,
          isNewUser: message.isNewUser ?? false
        }
      });
    },
    async signOut(message) {
      const tokenUserId =
        typeof (message as { token?: { sub?: string } }).token?.sub === "string"
          ? (message as { token?: { sub?: string } }).token?.sub
          : null;
      if (!tokenUserId) return;
      await logAuthEvent({
        userId: tokenUserId,
        eventType: "auth_sign_out"
      });
    }
  }
});

function resolveApiAuthTokenSecret(fallbackSecret: string) {
  const direct = (process.env.API_AUTH_TOKEN_SECRET || "").trim();
  if (direct.length >= 32) return direct;
  return fallbackSecret;
}
