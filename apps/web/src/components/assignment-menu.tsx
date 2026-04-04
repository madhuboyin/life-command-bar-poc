"use client";

import { useEffect, useMemo, useState } from "react";
import { assignObligation, getHouseholdMembers, unassignObligation } from "../lib/api";
import type { Obligation } from "../lib/types";
import { inputStyles } from "../lib/ui";
import { useToast } from "./ui/toast-provider";

type Props = {
  obligation: Pick<Obligation, "id" | "scopeType" | "householdId" | "assignedToUserId">;
  onUpdated?: () => void;
};

export default function AssignmentMenu({ obligation, onUpdated }: Props) {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [members, setMembers] = useState<Array<{ userId: string; label: string }>>([]);
  const [selected, setSelected] = useState(obligation.assignedToUserId ?? "");

  const householdId = obligation.householdId ?? null;
  const enabled = obligation.scopeType === "HOUSEHOLD" && Boolean(householdId);

  useEffect(() => {
    if (!enabled || !householdId) return;
    let cancelled = false;

    void (async () => {
      try {
        const data = await getHouseholdMembers(householdId);
        if (cancelled) return;
        setMembers(
          data.members.map((member) => ({
            userId: member.userId,
            label: member.user.name ?? member.user.email
          }))
        );
      } catch {
        if (!cancelled) {
          setMembers([]);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled, householdId]);

  useEffect(() => {
    setSelected(obligation.assignedToUserId ?? "");
  }, [obligation.assignedToUserId]);

  const options = useMemo(() => [{ userId: "", label: "Shared (unassigned)" }, ...members], [members]);

  if (!enabled) return null;

  async function handleChange(nextUserId: string) {
    try {
      setLoading(true);
      setSelected(nextUserId);
      if (nextUserId) {
        await assignObligation(obligation.id, nextUserId);
      } else {
        await unassignObligation(obligation.id);
      }
      onUpdated?.();
    } catch (error) {
      showToast({
        variant: "error",
        title: "Could not update assignment",
        description: error instanceof Error ? error.message : "Please try again."
      });
      setSelected(obligation.assignedToUserId ?? "");
    } finally {
      setLoading(false);
    }
  }

  return (
    <select
      value={selected}
      onChange={(event) => {
        void handleChange(event.target.value);
      }}
      disabled={loading}
      style={{ ...inputStyles.input, minWidth: 190 }}
    >
      {options.map((member) => (
        <option key={member.userId || "shared"} value={member.userId}>
          {member.label}
        </option>
      ))}
    </select>
  );
}
