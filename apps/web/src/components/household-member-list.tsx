"use client";

import { useState } from "react";
import { getHouseholdMembers, removeHouseholdMember } from "../lib/api";
import type { HouseholdMember } from "../lib/types";
import { buttonStyles, cardStyles, colors } from "../lib/ui";
import InviteHouseholdMemberForm from "./invite-household-member-form";
import { useToast } from "./ui/toast-provider";

type Props = {
  householdId: string;
  initialMembers: HouseholdMember[];
};

export default function HouseholdMemberList({ householdId, initialMembers }: Props) {
  const { showToast } = useToast();
  const [members, setMembers] = useState<HouseholdMember[]>(initialMembers);
  const [loadingMemberId, setLoadingMemberId] = useState<string | null>(null);

  async function refreshMembers() {
    const data = await getHouseholdMembers(householdId);
    setMembers(data.members);
  }

  async function handleRemove(memberId: string) {
    try {
      setLoadingMemberId(memberId);
      await removeHouseholdMember(householdId, memberId);
      await refreshMembers();
      showToast({
        variant: "success",
        title: "Member removed",
        description: "Household assignments were safely unassigned."
      });
    } catch (error) {
      showToast({
        variant: "error",
        title: "Could not remove member",
        description: error instanceof Error ? error.message : "Please try again."
      });
    } finally {
      setLoadingMemberId(null);
    }
  }

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <section style={cardStyles.section}>
        <div style={{ fontSize: 12, color: colors.textMuted, marginBottom: 10 }}>Invite</div>
        <InviteHouseholdMemberForm householdId={householdId} onInvited={refreshMembers} />
      </section>

      <section style={cardStyles.section}>
        <div style={{ fontSize: 12, color: colors.textMuted, marginBottom: 10 }}>Members</div>
        <div style={{ display: "grid", gap: 10 }}>
          {members.map((member) => (
            <article
              key={member.id}
              style={{
                ...cardStyles.item,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 10
              }}
            >
              <div>
                <div style={{ fontWeight: 700 }}>
                  {member.user.name ?? member.user.email}
                </div>
                <div style={{ fontSize: 13, color: colors.textMuted }}>
                  {member.user.email} · {member.role}
                </div>
              </div>
              <button
                type="button"
                onClick={() => void handleRemove(member.id)}
                style={buttonStyles.danger}
                disabled={loadingMemberId === member.id}
              >
                {loadingMemberId === member.id ? "Removing..." : "Remove"}
              </button>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
