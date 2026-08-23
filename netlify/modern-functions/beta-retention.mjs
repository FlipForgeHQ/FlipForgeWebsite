import { getStore } from "@netlify/blobs";
import { CONVERSION_STORE_NAME, listRecordEntries } from "./lib/beta-operations-core.mjs";

export default async function betaRetention() {
  const store = getStore({ name: CONVERSION_STORE_NAME, consistency: "strong" });
  const entries = await listRecordEntries(store, "event/");
  // The daily job removes records at 89 days so scheduling variance cannot
  // carry an anonymous event past the disclosed 90-day maximum.
  const cutoff = Date.now() - 89 * 24 * 60 * 60 * 1000;
  let deleted = 0;
  for (const entry of entries) {
    const occurredAt = Date.parse(entry.value?.occurredAt || "");
    if (Number.isFinite(occurredAt) && occurredAt < cutoff) {
      await store.delete(entry.key);
      deleted += 1;
    }
  }
  console.log(JSON.stringify({
    type: "flipforge_conversion_retention",
    operation: "EXPIRED_EVENTS_REMOVED",
    deleted,
    occurredAt: new Date().toISOString(),
  }));
}

export const config = {
  schedule: "0 3 * * *",
};
