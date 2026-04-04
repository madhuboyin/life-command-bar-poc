export type GuidedJourneyOption = {
  key: string;
  label: string;
  description?: string;
};

export type GuidedJourneyStepPayload = {
  key: string;
  title: string;
  description: string;
  whyItMatters: string;
  inputType: "NONE" | "SINGLE_SELECT";
  options: GuidedJourneyOption[];
  recommendedOption: string | null;
  selectedOption: string | null;
  isCompleted: boolean;
  completedAt: string | null;
  position: number;
};

export type GuidedJourneyPayload = {
  id: string;
  obligationId: string;
  journeyType: "BILL" | "SUBSCRIPTION" | "RENEWAL" | "COMMITMENT";
  status: "ACTIVE" | "COMPLETED" | "DISMISSED" | "ABANDONED";
  currentStepKey: string | null;
  currentStepIndex: number;
  totalSteps: number;
  progressPercent: number;
  summary: string | null;
  recommendedPath: string | null;
  why: {
    primaryReason: string;
    signals: string[];
    confidence: number;
    personalizationReason: string | null;
  };
  decisionTrace?: {
    sourceSignals: string[];
    rankingFactors: string[];
    suppressionFactors: string[];
    confidenceDrivers: string[];
  };
  currentStep: GuidedJourneyStepPayload | null;
  steps: GuidedJourneyStepPayload[];
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
};

export type GuidedJourneyTemplateStep = {
  key: string;
  title: string;
  description: string;
  whyItMatters: string;
  inputType: "NONE" | "SINGLE_SELECT";
  options: GuidedJourneyOption[];
  recommendedOption: string | null;
};

export type GuidedJourneyTemplate = {
  journeyType: "BILL" | "SUBSCRIPTION" | "RENEWAL" | "COMMITMENT";
  summary: string;
  recommendedPath: string;
  steps: GuidedJourneyTemplateStep[];
};
