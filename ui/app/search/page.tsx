import { getModels } from "@/lib/queries";
import SearchClient from "@/components/SearchClient";

export const dynamic = "force-dynamic";

export default async function SearchPage() {
  const models = await getModels();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Search</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Full-text search across eval prompts and responses.
        </p>
      </div>
      <SearchClient models={models} />
    </div>
  );
}
