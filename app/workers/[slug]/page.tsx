import { WorkerDetail } from "@/components/workers/WorkerDetail";

export const metadata = { title: "Digital Worker" };

export default async function WorkerPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return (
    <div className="container mx-auto max-w-screen-xl p-6">
      <WorkerDetail slug={slug} />
    </div>
  );
}
