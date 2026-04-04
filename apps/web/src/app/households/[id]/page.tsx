import { notFound } from "next/navigation";
import HouseholdOverviewShell from "../../../components/household-overview-shell";
import {
  getHousehold,
  getHouseholdControlTower,
  getHouseholdObligations,
  getHouseholdPulse
} from "../../../lib/api";

type Props = {
  params?: Promise<{ id?: string } | undefined>;
};

export default async function HouseholdPage({ params }: Props) {
  const resolved = (await params) ?? {};
  const householdId = resolved.id;
  if (!householdId) {
    notFound();
  }

  try {
    const [householdRes, pulse, controlTower, obligationsRes] = await Promise.all([
      getHousehold(householdId),
      getHouseholdPulse(householdId),
      getHouseholdControlTower(householdId),
      getHouseholdObligations(householdId, { view: "household", limit: 50 })
    ]);

    return (
      <HouseholdOverviewShell
        household={householdRes.household}
        initialPulse={pulse}
        initialControlTower={controlTower}
        initialObligations={obligationsRes.items}
      />
    );
  } catch {
    notFound();
  }
}
