import { sharedPipeline } from "@/lib/redis";
import { createStore } from "@/lib/store";

const redis = sharedPipeline();
const store = redis ? createStore(redis) : null;

// The most recent reviews people chose to share, one per repo or site.
export async function GET() {
  if (!store) return Response.json({ enabled: false, entries: [] });
  try {
    const entries = await store.board(12);
    return Response.json({ enabled: true, entries }, { headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=120" } });
  } catch (e) {
    console.error("Reading the board failed", String(e).slice(0, 200));
    return Response.json({ enabled: true, entries: [] }, { status: 503 });
  }
}
