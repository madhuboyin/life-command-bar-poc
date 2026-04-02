const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:4000";

export async function getTodayFeed() {
  const res = await fetch(`${API_BASE_URL}/today-feed`, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch today feed");
  return res.json();
}
