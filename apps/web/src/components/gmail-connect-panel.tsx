"use client";

import { useMemo, useState } from "react";
import {
  disconnectGmail,
  getGmailConnectionStatus,
  startGmailOAuth,
  syncGmail,
  updateGmailPreferences
} from "../lib/api";
import type { GmailConnectionStatus, GmailSyncResult } from "../lib/types";
import { buttonStyles, cardStyles, colors, radius } from "../lib/ui";
import StatusMessage from "./ui/status-message";
import { useToast } from "./ui/toast-provider";

type Props = {
  initialConnection: GmailConnectionStatus | null;
  oauthState?: string | null;
  oauthError?: string | null;
  oauthErrorDetails?: string | null;
};

export default function GmailConnectPanel({
  initialConnection,
  oauthState = null,
  oauthError = null,
  oauthErrorDetails = null
}: Props) {
  const [connection, setConnection] = useState<GmailConnectionStatus | null>(initialConnection);
  const [windowDays, setWindowDays] = useState<30 | 90 | 365>(
    normalizeWindowDays(initialConnection?.lastSyncWindowDays)
  );
  const [scanSubscriptions, setScanSubscriptions] = useState(
    initialConnection?.scanSubscriptions ?? true
  );
  const [scanBills, setScanBills] = useState(initialConnection?.scanBills ?? true);
  const [scanRenewals, setScanRenewals] = useState(initialConnection?.scanRenewals ?? true);
  const [includeRecurringReceipts, setIncludeRecurringReceipts] = useState(
    initialConnection?.includeRecurringReceipts ?? false
  );
  const [autoSyncEnabled, setAutoSyncEnabled] = useState(initialConnection?.autoSyncEnabled ?? false);
  const [lastSyncResult, setLastSyncResult] = useState<GmailSyncResult | null>(null);
  const [loading, setLoading] = useState<"connect" | "save" | "sync" | "disconnect" | "refresh" | null>(null);
  const [error, setError] = useState<string | null>(
    oauthError ? oauthErrorDetails || oauthError : null
  );

  const { showToast } = useToast();

  const canScan = scanSubscriptions || scanBills || scanRenewals || includeRecurringReceipts;
  const isConnected = Boolean(connection && connection.status === "ACTIVE");

  const connectionStatusLine = useMemo(() => {
    if (!connection) return "Not connected";
    if (connection.status === "ERROR") {
      return connection.errorMessage || "Connection needs attention";
    }
    if (connection.status === "DISCONNECTED") {
      return "Disconnected";
    }
    return "Connected";
  }, [connection]);

  async function refreshStatus() {
    try {
      setLoading("refresh");
      setError(null);
      const response = await getGmailConnectionStatus();
      setConnection(response.connection);
      setWindowDays(normalizeWindowDays(response.connection?.lastSyncWindowDays));
      if (response.connection) {
        setScanSubscriptions(response.connection.scanSubscriptions);
        setScanBills(response.connection.scanBills);
        setScanRenewals(response.connection.scanRenewals);
        setIncludeRecurringReceipts(response.connection.includeRecurringReceipts);
        setAutoSyncEnabled(response.connection.autoSyncEnabled);
      }
    } catch (refreshError) {
      const message =
        refreshError instanceof Error ? refreshError.message : "Could not refresh Gmail status";
      setError(message);
    } finally {
      setLoading(null);
    }
  }

  async function handleConnect() {
    try {
      setLoading("connect");
      setError(null);

      if (!canScan) {
        setError("Enable at least one category before connecting Gmail.");
        return;
      }

      const response = await startGmailOAuth({
        windowDays,
        autoSyncEnabled,
        scanSubscriptions,
        scanBills,
        scanRenewals,
        includeRecurringReceipts
      });

      window.location.href = response.authUrl;
    } catch (connectError) {
      const message = connectError instanceof Error ? connectError.message : "Could not connect Gmail";
      setError(message);
      showToast({ variant: "error", title: "Connect failed", description: message });
    } finally {
      setLoading(null);
    }
  }

  async function handleSave() {
    try {
      setLoading("save");
      setError(null);

      const response = await updateGmailPreferences({
        autoSyncEnabled,
        scanSubscriptions,
        scanBills,
        scanRenewals,
        includeRecurringReceipts
      });

      setConnection(response.connection);

      showToast({
        variant: "success",
        title: "Gmail settings saved",
        description: "Scan scope and sync preferences updated."
      });
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : "Could not save Gmail settings";
      setError(message);
      showToast({ variant: "error", title: "Save failed", description: message });
    } finally {
      setLoading(null);
    }
  }

  async function handleSync(mode: "INITIAL_BACKFILL" | "MANUAL_RESYNC" | "INCREMENTAL") {
    try {
      setLoading("sync");
      setError(null);

      const response = await syncGmail({
        mode,
        windowDays,
        scanSubscriptions,
        scanBills,
        scanRenewals,
        includeRecurringReceipts
      });

      setConnection(response.connection);
      setLastSyncResult(response.sync);

      showToast({
        variant: "success",
        title: "Gmail sync complete",
        description: `${response.sync.stats.ingestedCandidates} candidates created.`
      });
    } catch (syncError) {
      const message = syncError instanceof Error ? syncError.message : "Could not sync Gmail";
      setError(message);
      showToast({ variant: "error", title: "Sync failed", description: message });
    } finally {
      setLoading(null);
    }
  }

  async function handleDisconnect() {
    try {
      setLoading("disconnect");
      setError(null);

      await disconnectGmail();
      setConnection(null);
      setLastSyncResult(null);

      showToast({
        variant: "success",
        title: "Gmail disconnected",
        description: "Access removed. You can reconnect anytime."
      });
    } catch (disconnectError) {
      const message =
        disconnectError instanceof Error ? disconnectError.message : "Could not disconnect Gmail";
      setError(message);
      showToast({ variant: "error", title: "Disconnect failed", description: message });
    } finally {
      setLoading(null);
    }
  }

  return (
    <section style={{ ...cardStyles.bordered, display: "grid", gap: 14, marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <div>
          <h2 style={{ margin: "0 0 6px 0" }}>Gmail Read-Only Integration</h2>
          <p style={{ margin: 0, color: colors.textMuted, maxWidth: 760 }}>
            Connect Gmail so Life Command Bar can detect bills, renewals, subscriptions, and recurring
            receipts. We only scan for relevant life-admin signals, never summarize your full inbox, and
            route uncertain items to Review.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refreshStatus()}
          disabled={loading !== null}
          style={buttonStyles.secondary}
        >
          {loading === "refresh" ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <StatusPill label={isConnected ? "Connected" : "Not connected"} tone={isConnected ? "ok" : "muted"} />
        {connection?.email ? <StatusPill label={connection.email} tone="muted" /> : null}
        <StatusPill label={`Status: ${connection?.lastSyncStatus ?? "IDLE"}`} tone="muted" />
      </div>

      <div style={{ fontSize: 13, color: colors.textMuted }}>
        {connectionStatusLine}
        {connection?.lastSyncedAt ? ` · Last sync ${formatDateTime(connection.lastSyncedAt)}` : ""}
      </div>

      <div style={{ display: "grid", gap: 8 }}>
        <Toggle label="Scan subscriptions" checked={scanSubscriptions} onChange={setScanSubscriptions} />
        <Toggle label="Scan bills and due notices" checked={scanBills} onChange={setScanBills} />
        <Toggle label="Scan renewals" checked={scanRenewals} onChange={setScanRenewals} />
        <Toggle
          label="Include recurring receipts from known vendors"
          checked={includeRecurringReceipts}
          onChange={setIncludeRecurringReceipts}
        />
        <Toggle label="Enable auto-sync" checked={autoSyncEnabled} onChange={setAutoSyncEnabled} />
      </div>

      <div style={{ display: "grid", gap: 6, maxWidth: 260 }}>
        <span style={{ fontSize: 13, color: colors.textMuted }}>Initial/backfill scan range</span>
        <select
          value={String(windowDays)}
          onChange={(event) => setWindowDays(normalizeWindowDays(Number(event.target.value)))}
          style={selectStyles}
        >
          <option value="30">Last 30 days</option>
          <option value="90">Last 90 days</option>
          <option value="365">Last 12 months</option>
        </select>
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        {!isConnected ? (
          <button
            type="button"
            onClick={() => void handleConnect()}
            disabled={loading !== null || !canScan}
            style={buttonStyles.primary}
          >
            {loading === "connect" ? "Connecting..." : "Connect Gmail"}
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={loading !== null}
              style={buttonStyles.secondary}
            >
              {loading === "save" ? "Saving..." : "Save Gmail settings"}
            </button>
            <button
              type="button"
              onClick={() =>
                void handleSync(connection?.lastSyncedAt ? "MANUAL_RESYNC" : "INITIAL_BACKFILL")
              }
              disabled={loading !== null || !canScan}
              style={buttonStyles.primary}
            >
              {loading === "sync"
                ? "Syncing..."
                : connection?.lastSyncedAt
                  ? "Resync now"
                  : "Run initial sync"}
            </button>
            <button
              type="button"
              onClick={() => void handleDisconnect()}
              disabled={loading !== null}
              style={buttonStyles.danger}
            >
              {loading === "disconnect" ? "Disconnecting..." : "Disconnect Gmail"}
            </button>
          </>
        )}
      </div>

      {oauthState === "connected_sync_error" ? (
        <StatusMessage variant="error">
          Gmail connected, but the initial sync had issues. You can retry with Resync now.
        </StatusMessage>
      ) : null}

      {oauthState === "connected" ? (
        <StatusMessage variant="success">
          Gmail connected successfully. High-confidence matches can activate flows automatically;
          uncertain matches are routed to Review.
        </StatusMessage>
      ) : null}

      {lastSyncResult ? (
        <div
          style={{
            border: `1px solid ${colors.border}`,
            borderRadius: radius.lg,
            padding: 12,
            display: "grid",
            gap: 6
          }}
        >
          <div style={{ fontWeight: 600 }}>Last sync summary</div>
          <div style={{ fontSize: 13, color: colors.textMuted }}>
            Matched {lastSyncResult.stats.matchedMessages} · Fetched {lastSyncResult.stats.fetchedMessages}
            · Candidates {lastSyncResult.stats.ingestedCandidates} · Review routed {lastSyncResult.stats.reviewRouted}
            · Duplicates suppressed {lastSyncResult.stats.duplicateSuppressed}
          </div>
        </div>
      ) : null}

      {error ? <StatusMessage variant="error">{error}</StatusMessage> : null}
    </section>
  );
}

function Toggle({
  label,
  checked,
  onChange
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

function StatusPill({ label, tone }: { label: string; tone: "ok" | "muted" }) {
  return (
    <span
      style={{
        borderRadius: radius.pill,
        padding: "4px 10px",
        fontSize: 12,
        fontWeight: 600,
        background: tone === "ok" ? "#dcfce7" : colors.neutralBadgeBg,
        color: tone === "ok" ? "#166534" : colors.neutralBadgeText
      }}
    >
      {label}
    </span>
  );
}

function normalizeWindowDays(value: number | null | undefined): 30 | 90 | 365 {
  if (value === 90) return 90;
  if (value === 365) return 365;
  return 30;
}

function formatDateTime(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(parsed);
}

const selectStyles = {
  border: `1px solid ${colors.border}`,
  borderRadius: 8,
  height: 36,
  padding: "0 10px",
  fontSize: 14,
  background: "white"
};
