export interface ResolutionFlowResult {
  flowKey: string;
  recommendation: string;
  whyItMatters: string;
  steps: string[];
  primaryAction: string;
  secondaryActions: string[];
}
