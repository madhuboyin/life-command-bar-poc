"use client";

import { FormEvent, useState } from "react";
import { executeCommand, parseCommand } from "../lib/api";
import type {
  CommandExecuteResponse,
  CommandParseResponse,
  Obligation,
  TodayFeedItem
} from "../lib/types";
import { buttonStyles, cardStyles, colors, inputStyles } from "../lib/ui";
import SectionCard from "./ui/section-card";
import StatusMessage from "./ui/status-message";

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
    <SectionCard
      title="Command Bar"
      description="Try: “What do I need to handle today?” or “Track Netflix renewal”"
    >
      <form onSubmit={handleExecute}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type a command..."
            style={{
              ...inputStyles.input,
              flex: 1,
              minWidth: 260
            }}
          />

          <button
            type="button"
            onClick={handleParse}
            disabled={parsing || executing}
            style={buttonStyles.secondary}
          >
            {parsing ? "Parsing..." : "Parse"}
          </button>

          <button
            type="submit"
            disabled={executing || parsing}
            style={buttonStyles.primary}
          >
            {executing ? "Running..." : "Run"}
          </button>
        </div>
      </form>

      {error ? <StatusMessage variant="error">{error}</StatusMessage> : null}

      {parseResult ? (
        <div style={{ ...cardStyles.bordered, marginTop: 14 }}>
          <h3 style={{ marginTop: 0 }}>Parse Result</h3>
          <div><strong>Intent:</strong> {parseResult.intent}</div>
          <div><strong>Confidence:</strong> {parseResult.confidence}</div>
          <div><strong>Resolution type:</strong> {parseResult.resolution.type}</div>
          {parseResult.question ? <div><strong>Question:</strong> {parseResult.question}</div> : null}
        </div>
      ) : null}

      {executeResult ? (
        <div style={{ ...cardStyles.bordered, marginTop: 14 }}>
          <h3 style={{ marginTop: 0 }}>Execution Result</h3>
          <div><strong>Type:</strong> {executeResult.resultType}</div>

          {executeResult.resultType === "clarification" && executeResult.question ? (
            <p style={{ marginBottom: 0 }}>{executeResult.question}</p>
          ) : null}

          {executeResult.resultType === "new_obligation_candidate" ? (
            <p style={{ marginBottom: 0 }}>
              Candidate obligation title: <strong>{executeResult.title ?? "Unknown"}</strong>
            </p>
          ) : null}

          {executeResult.resultType === "obligation_list" && Array.isArray(executeResult.items) ? (
            <div style={{ marginTop: 10 }}>
              <strong>Matched obligations:</strong>
              <ul style={{ marginTop: 8 }}>
                {(executeResult.items as Obligation[]).map((item) => (
                  <li key={item.id}>{item.title}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {executeResult.resultType === "resolution_flow" && executeResult.recommendation ? (
            <div style={{ marginTop: 10 }}>
              <div><strong>Recommendation:</strong> {executeResult.recommendation.recommendation}</div>
              <ol style={{ marginTop: 8 }}>
                {executeResult.recommendation.steps.map((step, index) => (
                  <li key={index}>{step}</li>
                ))}
              </ol>
            </div>
          ) : null}

          {executeResult.resultType === "today_feed" ? (
            <p style={{ marginBottom: 0, color: colors.textMuted }}>
              Today Feed refreshed from command.
            </p>
          ) : null}
        </div>
      ) : null}
    </SectionCard>
  );
}
