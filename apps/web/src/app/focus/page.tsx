import FocusModeLauncher from "../../components/focus-mode-launcher";
import { getActiveFocusSession } from "../../lib/api";
import type { FocusSession } from "../../lib/types";

export default async function FocusPage() {
  let activeSession: FocusSession | null = null;

  try {
    const active = await getActiveFocusSession();
    activeSession = active.session;
  } catch {
    activeSession = null;
  }

  return <FocusModeLauncher activeSession={activeSession} />;
}
