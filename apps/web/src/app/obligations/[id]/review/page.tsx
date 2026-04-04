import Link from "next/link";
import { notFound } from "next/navigation";
import ObligationCandidateReview from "../../../../components/obligation-candidate-review";
import { getObligationById, getObligationSource } from "../../../../lib/api";
import { pageStyles } from "../../../../lib/ui";

type Props = {
  params?: Promise<{ id?: string } | undefined>;
};

export default async function ObligationCandidateReviewPage({ params }: Props) {
  const resolvedParams = (await params) ?? {};
  const id = resolvedParams.id;

  if (!id) {
    notFound();
  }

  try {
    const [{ obligation }, source] = await Promise.all([
      getObligationById(id),
      getObligationSource(id).catch(() => null)
    ]);

    if (!obligation) {
      notFound();
    }

    return (
      <main style={pageStyles.shell}>
        <div style={{ marginBottom: 20 }}>
          <Link href={`/obligations/${obligation.id}`} style={{ color: "#2563eb", textDecoration: "none" }}>
            ← Back to obligation
          </Link>
        </div>

        <h1 style={{ marginTop: 0 }}>Review Ingested Candidate</h1>
        <p style={{ marginTop: 0, color: "#6b7280" }}>
          Confirm extracted fields before activation.
        </p>

        <ObligationCandidateReview obligation={obligation} source={source} />
      </main>
    );
  } catch {
    notFound();
  }
}
