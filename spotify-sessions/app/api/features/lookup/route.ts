import { env } from "cloudflare:workers";
import {
  fetchAcousticBrainz,
  fetchMusiMapByIsrc,
  type MusiMapConfig,
  type ProviderResult,
  type ProviderTrack,
} from "../../../../lib/feature-provider";
import type { TrackFeatures } from "../../../../lib/session";

type RuntimeEnv = {
  DB: D1Database;
  MUSIMAP_CLIENT_ID?: string;
  MUSIMAP_CLIENT_SECRET?: string;
  MUSIMAP_SCOPE?: string;
};

type CachedRow = {
  spotify_track_id: string;
  isrc: string | null;
  musicbrainz_id: string | null;
  source: string;
  model_version: string | null;
  features_json: string;
  match_confidence: number;
};

const runtime = env as unknown as RuntimeEnv;
const db = runtime.DB;
const MAX_TEST_TRACKS = 20;
const LOOKUP_CONCURRENCY = 4;

const statements = [
  "CREATE TABLE IF NOT EXISTS track_features (spotify_track_id TEXT PRIMARY KEY, isrc TEXT, musicbrainz_id TEXT, source TEXT NOT NULL, model_version TEXT, features_json TEXT NOT NULL, match_confidence REAL NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)",
  "CREATE INDEX IF NOT EXISTS track_features_isrc_idx ON track_features(isrc)",
];

async function ensure() {
  await db.batch(statements.map((statement) => db.prepare(statement)));
}

function musiMapConfig(): MusiMapConfig | undefined {
  const clientId = runtime.MUSIMAP_CLIENT_ID ?? process.env.MUSIMAP_CLIENT_ID;
  const clientSecret = runtime.MUSIMAP_CLIENT_SECRET ?? process.env.MUSIMAP_CLIENT_SECRET;
  const scope = runtime.MUSIMAP_SCOPE ?? process.env.MUSIMAP_SCOPE;
  return clientId && clientSecret ? { clientId, clientSecret, scope } : undefined;
}

async function save(track: ProviderTrack, result: ProviderResult) {
  if (!result.features) return;
  const now = Date.now();
  await db
    .prepare(
      "INSERT INTO track_features (spotify_track_id,isrc,musicbrainz_id,source,model_version,features_json,match_confidence,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(spotify_track_id) DO UPDATE SET isrc=excluded.isrc,musicbrainz_id=excluded.musicbrainz_id,source=excluded.source,model_version=excluded.model_version,features_json=excluded.features_json,match_confidence=excluded.match_confidence,updated_at=excluded.updated_at",
    )
    .bind(
      track.spotifyTrackId,
      track.isrc || null,
      result.musicbrainzId || result.providerTrackId || null,
      result.provider,
      result.features.modelVersion || null,
      JSON.stringify(result.features),
      result.matchConfidence,
      now,
      now,
    )
    .run();
}

async function cached(track: ProviderTrack) {
  const exact = await db
    .prepare(
      "SELECT spotify_track_id,isrc,musicbrainz_id,source,model_version,features_json,match_confidence FROM track_features WHERE spotify_track_id = ? LIMIT 1",
    )
    .bind(track.spotifyTrackId)
    .first<CachedRow>();
  const row =
    exact ??
    (track.isrc
      ? await db
          .prepare(
            "SELECT spotify_track_id,isrc,musicbrainz_id,source,model_version,features_json,match_confidence FROM track_features WHERE isrc = ? ORDER BY updated_at DESC LIMIT 1",
          )
          .bind(track.isrc)
          .first<CachedRow>()
      : null);
  if (!row) return undefined;
  try {
    const features = JSON.parse(row.features_json) as TrackFeatures;
    if (row.spotify_track_id !== track.spotifyTrackId) {
      await save(track, {
        provider: row.source === "musimap" ? "musimap" : "acousticbrainz",
        musicbrainzId: row.musicbrainz_id ?? undefined,
        matchConfidence: row.match_confidence,
        features,
      });
    }
    return { features, source: row.source };
  } catch {
    return undefined;
  }
}

async function lookup(track: ProviderTrack) {
  const existing = await cached(track);
  if (existing)
    return {
      spotifyTrackId: track.spotifyTrackId,
      features: existing.features,
      source: existing.source,
      cached: true,
    };

  const config = musiMapConfig();
  let musiMapReason = config ? "" : "MusiMap is not configured.";
  if (config) {
    try {
      const result = await fetchMusiMapByIsrc(track, config);
      musiMapReason = result.reason ?? "";
      if (result.features) {
        await save(track, result);
        return {
          spotifyTrackId: track.spotifyTrackId,
          features: result.features,
          source: result.provider,
          cached: false,
        };
      }
    } catch (error) {
      musiMapReason = error instanceof Error ? error.message : "MusiMap lookup failed.";
    }
  }

  const fallback = await fetchAcousticBrainz(track);
  if (fallback.features) await save(track, fallback);
  return {
    spotifyTrackId: track.spotifyTrackId,
    features: fallback.features,
    source: fallback.features ? fallback.provider : undefined,
    reason: fallback.reason ?? musiMapReason,
    providerReason: musiMapReason || undefined,
    cached: false,
  };
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, task: (item: T) => Promise<R>) {
  const results = new Array<R>(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const index = next++;
        results[index] = await task(items[index]);
      }
    }),
  );
  return results;
}

export async function POST(request: Request) {
  try {
    await ensure();
    const body = (await request.json()) as { tracks?: ProviderTrack[] };
    const unique = new Map<string, ProviderTrack>();
    for (const track of body.tracks ?? []) {
      if (!track.spotifyTrackId || !track.title || !track.artist) continue;
      const key = track.isrc ? `isrc:${track.isrc}` : `spotify:${track.spotifyTrackId}`;
      if (!unique.has(key)) unique.set(key, track);
      if (unique.size >= MAX_TEST_TRACKS) break;
    }
    const tracks = [...unique.values()];
    const results = await mapWithConcurrency(tracks, LOOKUP_CONCURRENCY, lookup);
    const summary = {
      requested: tracks.length,
      measured: results.filter((result) => result.features).length,
      cacheHits: results.filter((result) => result.cached).length,
      musiMapMatches: results.filter((result) => result.source === "musimap").length,
      fallbackMatches: results.filter((result) => result.source === "acousticbrainz").length,
      musiMapConfigured: Boolean(musiMapConfig()),
    };
    return Response.json({ results, summary });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Feature lookup failed." },
      { status: 500 },
    );
  }
}
