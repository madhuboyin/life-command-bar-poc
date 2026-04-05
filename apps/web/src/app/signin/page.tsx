import { redirect } from "next/navigation";
import SignInButton from "../../components/sign-in-button";
import { auth } from "../../auth";
import { cardStyles, colors, pageStyles } from "../../lib/ui";
import { logAuthEvent } from "../../lib/auth/auth-observability";

type Props = {
  searchParams?: Promise<Record<string, string | string[] | undefined> | undefined>;
};

export default async function SignInPage({ searchParams }: Props) {
  const session = await auth();
  const resolved = (await searchParams) ?? {};
  const callbackUrl = firstSearchParam(resolved.callbackUrl) ?? "/";
  const reason = firstSearchParam(resolved.reason);
  const googleConfigured = Boolean(
    (process.env.AUTH_GOOGLE_ID || "").trim() &&
      (process.env.AUTH_GOOGLE_SECRET || "").trim()
  );

  if (session?.user?.id) {
    redirect(callbackUrl);
  }

  if (reason === "protected") {
    await logAuthEvent({
      userId: null,
      eventType: "protected_route_redirected",
      metadata: {
        callbackUrl
      }
    });
  }

  return (
    <main style={pageStyles.shell}>
      <section style={{ ...cardStyles.section, maxWidth: 560, margin: "80px auto 0 auto" }}>
        <h1 style={{ marginTop: 0 }}>Sign in to Life Command Bar</h1>
        <p style={{ color: colors.textMuted }}>
          Sign in with Google to access your subscriptions, obligations, Gmail signals, and household data.
        </p>
        {googleConfigured ? (
          <SignInButton callbackUrl={callbackUrl} />
        ) : (
          <p style={{ color: colors.textMuted, marginBottom: 0 }}>
            Google OAuth is not configured. Set `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET`, then retry.
          </p>
        )}
      </section>
    </main>
  );
}

function firstSearchParam(value: string | string[] | undefined) {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value[0] ?? null;
  return null;
}
