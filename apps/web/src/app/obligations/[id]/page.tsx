
import { notFound } from "next/navigation";
import { getObligationById } from "../../../lib/api";
import ObligationDetailClient from "../../../components/obligation-detail-client";

type Props = {
    params: Promise<{ id: string }>;
};

export default async function ObligationDetailPage({ params }: Props) {
    const { id } = await params;

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
