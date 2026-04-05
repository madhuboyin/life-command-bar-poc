import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";

const PROTECTED_PREFIXES = [
  "/obligations",
  "/review",
  "/subscriptions",
  "/control-tower",
  "/pulse",
  "/focus",
  "/guided",
  "/upcoming",
  "/settings",
  "/households"
];

const ADMIN_PREFIX = "/admin";
const SESSION_COOKIE_NAMES = [
  "__Secure-authjs.session-token",
  "authjs.session-token",
  "__Secure-next-auth.session-token",
  "next-auth.session-token"
];

type AuthTokenLike = {
  sub?: string | null;
  email?: string | null;
};

function isProtectedPath(pathname: string) {
  return PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

function isAdminPath(pathname: string) {
  return pathname === ADMIN_PREFIX || pathname.startsWith(`${ADMIN_PREFIX}/`);
}

function parseCsv(value: string | undefined) {
  if (!value) return [];
  return value
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

export default async function middleware(req: NextRequest) {
  const { nextUrl } = req;
  const pathname = nextUrl.pathname;

  if (pathname === "/" || pathname === "/signin") {
    return NextResponse.next();
  }

  const requiresAuth = isProtectedPath(pathname) || isAdminPath(pathname);
  if (!requiresAuth) {
    return NextResponse.next();
  }

  const token = await resolveAuthToken(req);

  if (!token?.sub && typeof token?.email !== "string") {
    const signInUrl = new URL("/signin", nextUrl.origin);
    signInUrl.searchParams.set("callbackUrl", `${pathname}${nextUrl.search}`);
    signInUrl.searchParams.set("reason", "protected");
    return NextResponse.redirect(signInUrl);
  }

  if (isAdminPath(pathname)) {
    const allowEmails = parseCsv(process.env.ADMIN_USER_EMAILS);
    if (allowEmails.length > 0) {
      const email = typeof token.email === "string" ? token.email.toLowerCase() : "";
      if (!allowEmails.includes(email)) {
        return NextResponse.redirect(new URL("/", nextUrl.origin));
      }
    }
  }

  return NextResponse.next();
}

async function resolveAuthToken(req: NextRequest) {
  const secret = (process.env.AUTH_SECRET || "").trim();

  if (!secret) {
    return hasSessionCookie(req) ? { sub: "session-cookie-present" } : null;
  }

  const attempts: Array<{
    cookieName?: string;
    secureCookie?: boolean;
    salt?: string;
  }> = [
    {
      cookieName: "__Secure-authjs.session-token",
      secureCookie: true,
      salt: "__Secure-authjs.session-token"
    },
    {
      cookieName: "authjs.session-token",
      secureCookie: false,
      salt: "authjs.session-token"
    },
    {
      cookieName: "__Secure-next-auth.session-token",
      secureCookie: true,
      salt: "__Secure-next-auth.session-token"
    },
    {
      cookieName: "next-auth.session-token",
      secureCookie: false,
      salt: "next-auth.session-token"
    },
    {
      secureCookie: true
    },
    {
      secureCookie: false
    },
    {}
  ];

  for (const attempt of attempts) {
    const token = (await getToken({
      req,
      secret,
      cookieName: attempt.cookieName,
      secureCookie: attempt.secureCookie,
      salt: attempt.salt
    })) as AuthTokenLike | null;
    if (token?.sub || token?.email) {
      return token;
    }
  }

  if (hasSessionCookie(req)) {
    return { sub: "session-cookie-present" };
  }

  return null;
}

function hasSessionCookie(req: NextRequest) {
  return req.cookies.getAll().some((cookie) =>
    SESSION_COOKIE_NAMES.some((name) => cookie.name === name || cookie.name.startsWith(`${name}.`))
  );
}

export const config = {
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico).*)"]
};
