"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import {
  abandonFlowSession,
  completeFlowSessionStep,
  createOrResumeFlowSession,
  getFlowSessionById,
  moveFlowSessionNext
} from "../lib/api";
import type { FlowSession, FlowSourceContext, FlowSourceType } from "../lib/types";

type FlowSessionContextValue = {
  activeSession: FlowSession | null;
  setActiveSession: (session: FlowSession | null) => void;
  startSession: (input: {
    sessionId?: string;
    sourceType: FlowSourceType;
    sourceContext?: FlowSourceContext;
    currentObligationId: string;
    currentJourneyId?: string;
    reuseLatest?: boolean;
  }) => Promise<FlowSession>;
  refreshSession: (sessionId: string) => Promise<FlowSession>;
  completeStep: (sessionId: string, input?: { obligationId?: string; journeyId?: string }) => Promise<FlowSession>;
  moveNext: (sessionId: string, input?: { preferredObligationId?: string }) => Promise<FlowSession>;
  abandon: (sessionId: string) => Promise<FlowSession>;
  clearSession: () => void;
};

const STORAGE_KEY = "lcb.activeFlowSession";
const FlowSessionContext = createContext<FlowSessionContextValue | null>(null);

export function FlowSessionProvider({ children }: { children: React.ReactNode }) {
  const [activeSession, setActiveSessionState] = useState<FlowSession | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as FlowSession;
      if (parsed && parsed.id) {
        setActiveSessionState(parsed);
      }
    } catch {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  function setActiveSession(session: FlowSession | null) {
    setActiveSessionState(session);

    if (typeof window === "undefined") return;
    if (!session) {
      window.localStorage.removeItem(STORAGE_KEY);
      return;
    }

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  }

  async function startSession(input: {
    sessionId?: string;
    sourceType: FlowSourceType;
    sourceContext?: FlowSourceContext;
    currentObligationId: string;
    currentJourneyId?: string;
    reuseLatest?: boolean;
  }) {
    const data = await createOrResumeFlowSession(input);
    setActiveSession(data.session);
    return data.session;
  }

  async function refreshSession(sessionId: string) {
    const data = await getFlowSessionById(sessionId);
    setActiveSession(data.session);
    return data.session;
  }

  async function completeStep(sessionId: string, input?: { obligationId?: string; journeyId?: string }) {
    const data = await completeFlowSessionStep(sessionId, input);
    setActiveSession(data.session);
    return data.session;
  }

  async function moveNext(sessionId: string, input?: { preferredObligationId?: string }) {
    const data = await moveFlowSessionNext(sessionId, input);
    setActiveSession(data.session);
    return data.session;
  }

  async function abandon(sessionId: string) {
    const data = await abandonFlowSession(sessionId);
    setActiveSession(data.session);
    return data.session;
  }

  function clearSession() {
    setActiveSession(null);
  }

  const value: FlowSessionContextValue = {
    activeSession,
    setActiveSession,
    startSession,
    refreshSession,
    completeStep,
    moveNext,
    abandon,
    clearSession
  };

  return (
    <FlowSessionContext.Provider value={value}>
      {children}
    </FlowSessionContext.Provider>
  );
}

export function useFlowSession() {
  const context = useContext(FlowSessionContext);
  if (!context) {
    throw new Error("useFlowSession must be used within FlowSessionProvider");
  }
  return context;
}
