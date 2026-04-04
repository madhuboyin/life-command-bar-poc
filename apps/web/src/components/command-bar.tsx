"use client";

import { FormEvent, useState } from "react";
import { executeCommand, ingestCommand, parseCommand } from "../lib/api";
import type {
  CommandExecuteResponse,
  CommandParseResponse,
  IngestionResult,
  Obligation,
  TodayFeedItem
} from "../lib/types";
import { buttonStyles, cardStyles, colors, inputStyles } from "../lib/ui";
import { useIsMobile } from "../lib/use-is-mobile";
import IngestionResultCard from "./ingestion-result-card";
import SectionCard from "./ui/section-card";
import StatusMessage from "./ui/status-message";
import { useToast } from "./ui/toast-provider";

type Props = {
  onFeedReplace: (items: TodayFeedItem[]) => void;
  onCompleted?: () => Promise<void>;
};

export default function CommandBar({ onFeedReplace, onCompleted }: Props) {
  const [input, setInput] = useState("");
  const [obligationContextId, setObligationContextId] = useState("");
  const [parsing, setParsing] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [parseResult, setParseResult] = useState<CommandParseResponse | null>(null);
  const [executeResult, setExecuteResult] = useState<CommandExecuteResponse | null>(null);
  const [ingestionResult, setIngestionResult] = useState<IngestionResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { showToast } = useToast();
  const isMobile = useIsMobile();

  async function handleParse() {
    if (!input.trim()) return;

    try {
      setParsing(true);
      setError(null);
      const result = await parseCommand({
        input,
        context: obligationContextId.trim()
          ? { obligationId: obligationContextId.trim() }
          : undefined
      });
      setParseResult(result);
      showToast({
        variant: "info",
        title: "Command parsed",
        description: `Intent: ${result.intent}`
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to parse command";
      setError(message);
      showToast({ variant: "error", title: "Parse failed", description: message });
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

      const result = await executeCommand({
        input,
        context: obligationContextId.trim()
          ? { obligationId: obligationContextId.trim() }
          : undefined
      });
      setExecuteResult(result);
      if (result.ingestion) {
        setIngestionResult(result.ingestion);
      }

      if (result.resultType === "today_feed" && Array.isArray(result.items)) {
        onFeedReplace(result.items as TodayFeedItem[]);
      }

      showToast({
        variant: "success",
        title: "Command executed",
        description: `Result type: ${result.resultType}`
      });

      if (result.ingestion && onCompleted) {
        await onCompleted();
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to execute command";
      setError(message);
      showToast({ variant: "error", title: "Command failed", description: message });
    } finally {
      setExecuting(false);
    }
  }

  async function handleCapture() {
    if (!input.trim()) return;

    try {
      setExecuting(true);
      setError(null);

      const result = await ingestCommand({
        input,
        context: obligationContextId.trim()
          ? { obligationId: obligationContextId.trim() }
          : undefined
      });
      setIngestionResult(result);

      showToast({
        variant: "success",
        title: "Command captured",
        description:
          result.status === "NO_CANDIDATE"
            ? "Capture saved with partial extraction"
            : "Obligation candidate created"
      });

      if (onCompleted) {
        await onCompleted();
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to capture command";
      setError(message);
      showToast({ variant: "error", title: "Capture failed", description: message });
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
        <div
          style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr auto auto auto",
            gap: 10
          }}
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type a command..."
            style={inputStyles.input}
          />

          <input
            value={obligationContextId}
            onChange={(e) => setObligationContextId(e.target.value)}
            placeholder="Obligation ID (optional)"
            style={inputStyles.input}
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
            type="button"
            onClick={handleCapture}
            disabled={executing || parsing}
            style={buttonStyles.secondary}
          >
            {executing ? "Capturing..." : "Capture"}
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

          {executeResult.resultType === "ingestion_candidate" ? (
            <p style={{ marginBottom: 0, color: colors.textMuted }}>
              Command created an ingestion candidate.
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

      {ingestionResult ? (
        <IngestionResultCard
          result={ingestionResult}
          sourceLabel="Captured from command"
        />
      ) : null}
    </SectionCard>
  );
}
