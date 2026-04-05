import { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: DefaultSession["user"] & {
      id: string;
    };
    apiAccessToken: string | null;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    apiAccessToken?: string;
    apiAccessTokenExpiresAt?: number;
  }
}

