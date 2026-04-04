import FocusSessionShell from "../../../components/focus-session-shell";
import { getFocusSessionById } from "../../../lib/api";
import type { FocusSession } from "../../../lib/types";

type Props = {
  params?: Promise<{ id?: string } | undefined>;
};

export default async function FocusSessionPage({ params }: Props) {
  const resolvedParams = (await params) ?? {};
  const sessionId = resolvedParams.id;

  if (!sessionId) {
    return (
      <FocusSessionShell
        initialSession={null}
        sessionId=""
        initialError="Focus session id is missing."
      />
    );
  }

  let session: FocusSession | null = null;
  let error: string | null = null;

  try {
    const data = await getFocusSessionById(sessionId);
    session = data.session;
  } catch (fetchError) {
    error =
      fetchError instanceof Error
        ? fetchError.message
        : "Could not load focus session right now.";
  }

  return <FocusSessionShell initialSession={session} sessionId={sessionId} initialError={error} />;
}
