import { getUnannotated } from "@/lib/queries";
import AnnotationList from "@/components/AnnotationList";

export const dynamic = "force-dynamic";

export default async function AnnotatePage() {
  const records = await getUnannotated();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Annotate</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Review eval records that haven&apos;t been annotated yet. Saving an
          annotation writes it to Redis and marks the record annotated in
          Elasticsearch.
        </p>
      </div>
      <AnnotationList initialRecords={records} />
    </div>
  );
}
