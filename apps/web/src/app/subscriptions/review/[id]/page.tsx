import { notFound } from "next/navigation";
import SubscriptionReviewFlowShell from "../../../../components/subscription-review-flow-shell";
import { getSubscriptionReviewFlow } from "../../../../lib/api";
import type { SubscriptionDecisionFlowData } from "../../../../lib/types";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function SubscriptionReviewFlowPage({ params }: Props) {
  const resolved = await params;
  const subscriptionId = resolved.id;

  let data: SubscriptionDecisionFlowData | null = null;
  let error: string | null = null;

  try {
    data = await getSubscriptionReviewFlow(subscriptionId);
  } catch (fetchError) {
    if (fetchError instanceof Error && fetchError.message.toLowerCase().includes("not found")) {
      notFound();
    }
    error =
      fetchError instanceof Error
        ? fetchError.message
        : "Could not load subscription review flow.";
  }

  if (!data && !error) {
    notFound();
  }

  return (
    <SubscriptionReviewFlowShell
      subscriptionId={subscriptionId}
      initialData={data}
      initialError={error}
    />
  );
}
