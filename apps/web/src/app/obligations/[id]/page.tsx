import { notFound } from "next/navigation";
import { getObligationById } from "../../../lib/api";
import ObligationDetailClient from "../../../components/obligation-detail-client";

type Props = {
  params?: Promise<{ id?: string } | undefined>;
};

export default async function ObligationDetailPage({ params }: Props) {
  const resolvedParams = (await params) ?? {};
  const id = resolvedParams.id;

  if (!id) {
    notFound();
  }

  try {
    const data = await getObligationById(id);

    if (!data?.obligation) {
      notFound();
    }

    return <ObligationDetailClient obligation={data.obligation} />;
  } catch {
    notFound();
  }
}
