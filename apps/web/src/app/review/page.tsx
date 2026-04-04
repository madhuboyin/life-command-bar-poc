import ReviewQueueShell from "../../components/review-queue-shell";
import { getReviewQueue } from "../../lib/api";
import type { ReviewQueueResponse } from "../../lib/types";

export default async function ReviewQueuePage() {
  let data: ReviewQueueResponse = {
    items: [],
    pagination: {
      limit: 100,
      total: 0
    }
  };
  let initialError: string | null = null;

  try {
    data = await getReviewQueue({ limit: 100 });
  } catch (error) {
    initialError =
      error instanceof Error ? error.message : "Could not load the review queue.";
  }

  return <ReviewQueueShell initialData={data} initialError={initialError} />;
}
