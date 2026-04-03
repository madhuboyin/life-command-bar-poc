"use client";

import { FormEvent, useState } from "react";
import { executeCommand, parseCommand } from "../lib/api";
import type {
  CommandExecuteResponse,
  CommandParseResponse,
  Obligation,
  TodayFeedItem
} from "../lib/types";

type Props = {
  onFeedReplace: (items: TodayFeedItem[]) => void;
};

export default function CommandBar({ onFeedReplace }: Props) {
  const [input, setInput] = useState("");
  const [parsing, setParsing] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [parseResult, setParseResult] = useState<CommandParseResponse | null>(null);
  const [executeResult, setExecuteResult] = useState<CommandExecuteResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleParse() {
    if (!input.trim()) return;

    try {
      setParsing(true);
      setError(null);
      const result = await parseCommand({ input });
      setParseResult(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to parse command");
    } finally {
      setParsing(false);
    }
  }

  async function handleExecute(event: FormEvent) {
    event.preventDefault();
    if (!input.trim()) return;

    try {
      setExecuting(true);
      setError(null);

      const result = await executeCommand({ input });
      setExecuteResult(result);

      if (result.resultType === "today_feed" && Array.isArray(result.items)) {
        onFeedReplace(result.items as TodayFeedItem[]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to execute command");
    } finally {
      setExecuting(false);
    }
  }

  return (
    <section
      style={{
        background: "#fff",
        borderRadius: 18,
        padding: 20,
        boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
        marginBottom: 24
      }}
    >
      <div style={{ marginBottom: 14 }}>
        <h2 style={{ margin: 0 }}>Command Bar</h2>
        <p style={{ margin: "6px 0 0 0", color: "#6b7280" }}>
          Try: “What do I need to handle today?” or “Track Netflix renewal”
        </p>
      </div>

      <form onSubmit={handleExecute}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type a command..."
            style={{
              flex: 1,
              minWidth: 260,
              padding: "12px 14px",
              borderRadius: 12,
              border: "1px solid #d1d5db",
              fontSize: 14
            }}
          />

          <button type="button" onClick={handleParse} disabled={parsing || executing} style={secondaryButton}>
            {parsing ? "Parsing..." : "Parse"}
          </button>

          <button type="submit" disabled={executing || parsing} style={primaryButton}>
            {executing ? "Running..." : "Run"}
          </button>
        </div>
      </form>

      {error && (
        <div style={errorBox}>
          {error}
        </div>
      )}

      {parseResult && (
        <div style={resultBox}>
          <h3 style={{ marginTop: 0 }}>Parse Result</h3>
          <div><strong>Intent:</strong> {parseResult.intent}</div>
          <div><strong>Confidence:</strong> {parseResult.confidence}</div>
          <div><strong>Resolution type:</strong> {parseResult.resolution.type}</div>
          {parseResult.question && <div><strong>Question:</strong> {parseResult.question}</div>}
        </div>
      )}

      {executeResult && (
        <div style={resultBox}>
          <h3 style={{ marginTop: 0 }}>Execution Result</h3>
          <div><strong>Type:</strong> {executeResult.resultType}</div>

          {executeResult.resultType === "clarification" && executeResult.question && (
            <p style={{ marginBottom: 0 }}>{executeResult.question}</p>
          )}

          {executeResult.resultType === "new_obligation_candidate" && (
            <p style={{ marginBottom: 0 }}>
              Candidate obligation title: <strong>{executeResult.title ?? "Unknown"}</strong>
            </p>
          )}

          {executeResult.resultType === "obligation_list" && Array.isArray(executeResult.items) && (
            <div style={{ marginTop: 10 }}>
              <strong>Matched obligations:</strong>
              <ul style={{ marginTop: 8 }}>
                {(executeResult.items as Obligation[]).map((item) => (
                  <li key={item.id}>{item.title}</li>
                ))}
              </ul>
            </div>
          )}

          {executeResult.resultType === "resolution_flow" && executeResult.recommendation && (
            <div style={{ marginTop: 10 }}>
              <div><strong>Recommendation:</strong> {executeResult.recommendation.recommendation}</div>
              <ol style={{ marginTop: 8 }}>
                {executeResult.recommendation.steps.map((step, index) => (
                  <li key={index}>{step}</li>
                ))}
              </ol>
            </div>
          )}

          {executeResult.resultType === "today_feed" && (
            <p style={{ marginBottom: 0 }}>Today Feed refreshed from command.</p>
          )}
        </div>
      )}
    </section>
  );
}

const primaryButton: React.CSSProperties = {
  border: "none",
  background: "#111827",
  color: "#fff",
  borderRadius: 10,
  padding: "12px 14px",
  fontWeight: 600,
  cursor: "pointer"
};

const secondaryButton: React.CSSProperties = {
  border: "1px solid #d1d5db",
  background: "#fff",
  color: "#111827",
  borderRadius: 10,
  padding: "12px 14px",
  fontWeight: 600,
  cursor: "pointer"
};

const resultBox: React.CSSProperties = {
  marginTop: 14,
  padding: 14,
  borderRadius: 12,
  background: "#f9fafb",
  border: "1px solid #e5e7eb"
};

const errorBox: React.CSSProperties = {
  marginTop: 14,
  padding: 10,
  borderRadius: 10,
  background: "#fef2f2",
  color: "#991b1b"
};
