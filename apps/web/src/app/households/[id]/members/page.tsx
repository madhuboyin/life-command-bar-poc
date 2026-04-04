import Link from "next/link";
import { notFound } from "next/navigation";
import HouseholdMemberList from "../../../../components/household-member-list";
import { getHousehold, getHouseholdMembers } from "../../../../lib/api";
import { pageStyles } from "../../../../lib/ui";

type Props = {
  params?: Promise<{ id?: string } | undefined>;
};

export default async function HouseholdMembersPage({ params }: Props) {
  const resolved = (await params) ?? {};
  const householdId = resolved.id;
  if (!householdId) {
    notFound();
  }

  try {
    const [householdRes, membersRes] = await Promise.all([
      getHousehold(householdId),
      getHouseholdMembers(householdId)
    ]);

    return (
      <main style={pageStyles.shell}>
        <div style={{ marginBottom: 14 }}>
          <Link href={`/households/${householdId}`} style={{ color: "#2563eb", textDecoration: "none" }}>
            ← Back to household overview
          </Link>
        </div>
        <h1 style={{ marginTop: 0 }}>{householdRes.household.name} Members</h1>
        <HouseholdMemberList
          householdId={householdId}
          initialMembers={membersRes.members}
        />
      </main>
    );
  } catch {
    notFound();
  }
}
