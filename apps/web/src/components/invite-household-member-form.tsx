"use client";

import { FormEvent, useState } from "react";
import { inviteHouseholdMember } from "../lib/api";
import { buttonStyles, inputStyles } from "../lib/ui";
import { useToast } from "./ui/toast-provider";

type Props = {
  householdId: string;
  onInvited?: () => void;
};

export default function InviteHouseholdMemberForm({ householdId, onInvited }: Props) {
  const { showToast } = useToast();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"OWNER" | "MEMBER">("MEMBER");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    try {
      setLoading(true);
      await inviteHouseholdMember(householdId, {
        invitedEmail: email,
        role
      });
      setEmail("");
      setRole("MEMBER");
      showToast({
        variant: "success",
        title: "Invite sent",
        description: "Household invite created successfully."
      });
      onInvited?.();
    } catch (error) {
      showToast({
        variant: "error",
        title: "Could not send invite",
        description: error instanceof Error ? error.message : "Please try again."
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: "grid", gap: 10 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 140px", gap: 10 }}>
        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="name@example.com"
          required
          style={inputStyles.input}
        />
        <select
          value={role}
          onChange={(event) => setRole(event.target.value as "OWNER" | "MEMBER")}
          style={inputStyles.input}
        >
          <option value="MEMBER">Member</option>
          <option value="OWNER">Owner</option>
        </select>
      </div>
      <div>
        <button type="submit" disabled={loading} style={buttonStyles.primary}>
          {loading ? "Sending..." : "Invite member"}
        </button>
      </div>
    </form>
  );
}
