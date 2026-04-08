import SubscriptionReviewHubShell from "../../../components/subscription-review-hub-shell";
import { getSubscriptionReviewHub } from "../../../lib/api";
import type { SubscriptionReviewHubResponse } from "../../../lib/types";

export default async function SubscriptionReviewHubPage() {
  let data: SubscriptionReviewHubResponse | null = null;
  let error: string | null = null;

  try {
    data = await getSubscriptionReviewHub();
  } catch (fetchError) {
    error =
      fetchError instanceof Error
        ? fetchError.message
        : "Could not load subscription review hub.";
  }

  return <SubscriptionReviewHubShell initialData={data} initialError={error} />;
}
