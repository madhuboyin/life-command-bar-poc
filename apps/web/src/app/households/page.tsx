import HouseholdDirectoryShell from "../../components/household-directory-shell";
import { getHouseholds } from "../../lib/api";

export default async function HouseholdsPage() {
  let households: Awaited<ReturnType<typeof getHouseholds>>["households"] = [];
  try {
    const data = await getHouseholds();
    households = data.households;
  } catch {
    households = [];
  }

  return <HouseholdDirectoryShell initialHouseholds={households} />;
}
