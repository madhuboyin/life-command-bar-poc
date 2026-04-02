import { getTodayFeed } from "../lib/api";

export default async function HomePage() {
  const data = await getTodayFeed();

  return (
    <main style={{ maxWidth: 900, margin: "40px auto", padding: 24 }}>
      <h1 style={{ marginBottom: 8 }}>Life Command Bar</h1>
      <p style={{ color: "#666", marginBottom: 24 }}>
        Your daily command center for real-life admin.
      </p>

      <section
        style={{
          background: "#fff",
          borderRadius: 16,
          padding: 20,
          boxShadow: "0 1px 3px rgba(0,0,0,0.08)"
        }}
      >
        <h2 style={{ marginTop: 0 }}>Today Feed</h2>

        <div style={{ display: "grid", gap: 16 }}>
          {data.items.map((item: any) => (
            <article
              key={item.obligation.id}
              style={{
                border: "1px solid #e5e7eb",
                borderRadius: 12,
                padding: 16,
                background: "#fafafa"
              }}
            >
              <h3 style={{ marginTop: 0 }}>{item.obligation.title}</h3>
              <p><strong>Why:</strong> {item.whyItMatters}</p>
              <p><strong>What:</strong> {item.whatToDo}</p>
              <p><strong>How hard:</strong> {item.howHardIsIt}</p>
              <p><strong>Primary action:</strong> {item.primaryAction}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
