import { WorkItemDetail } from "./work-item-detail";

export default async function PathologyWorkItemDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return <WorkItemDetail itemId={id} />;
}
