"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { getHouseholds } from "../lib/api";

type HouseholdOption = {
  id: string;
  name: string;
};

export default function HouseholdSwitcher() {
  const router = useRouter();
  const pathname = usePathname();
  const [households, setHouseholds] = useState<HouseholdOption[]>([]);
  const [selected, setSelected] = useState("personal");

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const data = await getHouseholds();
        if (cancelled) return;
        setHouseholds(data.households.map((item) => ({ id: item.id, name: item.name })));
      } catch {
        if (!cancelled) setHouseholds([]);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!pathname) return;
    const match = pathname.match(/^\/households\/([^/]+)/);
    if (match?.[1]) {
      setSelected(match[1]);
      if (typeof window !== "undefined") {
        window.localStorage.setItem("lcb.activeHouseholdId", match[1]);
      }
      return;
    }

    setSelected("personal");
    if (typeof window !== "undefined") {
      window.localStorage.removeItem("lcb.activeHouseholdId");
    }
  }, [pathname]);

  const options = useMemo(
    () => [
      { id: "personal", label: "Personal" },
      ...households.map((item) => ({ id: item.id, label: `Household: ${item.name}` }))
    ],
    [households]
  );

  return (
    <select
      value={selected}
      onChange={(event) => {
        const next = event.target.value;
        setSelected(next);
        if (next === "personal") {
          router.push("/");
          return;
        }
        router.push(`/households/${next}`);
      }}
      style={{
        border: "1px solid #d1d5db",
        borderRadius: 10,
        background: "#fff",
        color: "#111827",
        padding: "6px 10px",
        fontSize: 13
      }}
    >
      {options.map((option) => (
        <option key={option.id} value={option.id}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
