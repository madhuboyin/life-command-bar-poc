import { NextResponse } from "next/server";
import { auth } from "./auth";

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

export default auth((req) => {
  const { nextUrl } = req;
  const pathname = nextUrl.pathname;

  if (pathname === "/" || pathname === "/signin") {
    return NextResponse.next();
  }

  const requiresAuth = isProtectedPath(pathname) || isAdminPath(pathname);
  if (!requiresAuth) {
    return NextResponse.next();
  }

  if (!req.auth?.user?.id) {
    const signInUrl = new URL("/signin", nextUrl.origin);
    signInUrl.searchParams.set("callbackUrl", `${pathname}${nextUrl.search}`);
    signInUrl.searchParams.set("reason", "protected");
    return NextResponse.redirect(signInUrl);
  }

  if (isAdminPath(pathname)) {
    const allowEmails = parseCsv(process.env.ADMIN_USER_EMAILS);
    if (allowEmails.length > 0) {
      const email = req.auth.user.email?.toLowerCase() ?? "";
      if (!allowEmails.includes(email)) {
        return NextResponse.redirect(new URL("/", nextUrl.origin));
      }
    }
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico).*)"]
};
