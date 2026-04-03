import { getTodayFeed } from "../lib/api";
import HomeShell from "../components/home-shell";

export default async function HomePage() {
  const data = await getTodayFeed();

  return (
    <main style={{ maxWidth: 980, margin: "40px auto", padding: 24 }}>
      <header style={{ marginBottom: 24 }}>
        <h1 style={{ margin: "0 0 8px 0" }}>Life Command Bar</h1>
        <p style={{ color: "#6b7280", margin: 0 }}>
          Your daily command center for real-life admin.
        </p>
      </header>

      <HomeShell initialData={data} />
    </main>
  );
}
