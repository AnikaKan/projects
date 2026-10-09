import { env } from "cloudflare:workers";

type RuntimeEnv = {
  DB: D1Database;
  SPOTIFY_CLIENT_ID?: string;
  SPOTIFY_CLIENT_SECRET?: string;
};
type ArtworkRequestTrack = {
  id: string;
  title: string;
  artist: string;
  duration?: number;
};
type ItunesTrack = {
  trackName?: string;
  artistName?: string;
  collectionName?: string;
  artworkUrl100?: string;
  trackTimeMillis?: number;
  trackViewUrl?: string;
  previewUrl?: string;
};
type ArtworkResult = {
  id: string;
  imageUrl?: string;
  album?: string;
  sourceUrl?: string;
  previewUrl?: string;
  source?: "spotify" | "itunes";
  matched?: boolean;
};
type SpotifyTrack = {
  name?: string;
  artists?: { name?: string }[];
  album?: { name?: string; images?: { url?: string; width?: number; height?: number }[] };
  duration_ms?: number;
  external_urls?: { spotify?: string };
  preview_url?: string | null;
};

const runtime = env as unknown as RuntimeEnv;
const MAX_TRACKS = 50;
const CONCURRENCY = 3;
let spotifyToken: { value: string; expiresAt: number } | undefined;

function normalize(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\b(feat|featuring|ft)\.?\b.*$/i, "")
    .replace(/\s*[([].*?[)\]]\s*$/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function cacheKey(track: ArtworkRequestTrack) {
  return `${normalize(track.title)}|${normalize(track.artist.split(",")[0])}`;
}

function artworkSize(url: string) {
  return url.replace(/\/\d+x\d+bb\./, "/600x600bb.").replace(/^http:/, "https:");
}

function matchScore(track: ArtworkRequestTrack, candidate: ItunesTrack) {
  const title = normalize(track.title);
  const artist = normalize(track.artist.split(",")[0]);
  const candidateTitle = normalize(candidate.trackName || "");
  const candidateArtist = normalize(candidate.artistName || "");
  if (!title || !artist || !candidateTitle || !candidateArtist) return -1;

  const titleExact = candidateTitle === title;
  const artistExact = candidateArtist === artist;
  const titleClose = candidateTitle.includes(title) || title.includes(candidateTitle);
  const artistClose = candidateArtist.includes(artist) || artist.includes(candidateArtist);
  if ((!titleExact && !titleClose) || (!artistExact && !artistClose)) return -1;

  let score = titleExact ? 8 : 4;
  score += artistExact ? 6 : 3;
  if (track.duration && candidate.trackTimeMillis) {
    const difference = Math.abs(track.duration - candidate.trackTimeMillis / 1000);
    if (difference <= 4) score += 3;
    else if (difference <= 12) score += 2;
    else if (difference <= 25) score += 1;
    else score -= 2;
  }
  return score;
}

async function searchArtwork(track: ArtworkRequestTrack): Promise<ArtworkResult> {
  const params = new URLSearchParams({
    term: `${track.title} ${track.artist.split(",")[0]}`,
    media: "music",
    entity: "song",
    country: "US",
    limit: "10",
  });
  const response = await fetch(`https://itunes.apple.com/search?${params}`, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) return { id: track.id, matched: false };
  const payload = (await response.json()) as { results?: ItunesTrack[] };
  const ranked = (payload.results || [])
    .filter((candidate) => candidate.artworkUrl100 && candidate.previewUrl)
    .map((candidate) => ({ candidate, score: matchScore(track, candidate) }))
    .filter((item) => item.score >= 7)
    .sort((a, b) => b.score - a.score);
  const best = ranked[0]?.candidate;
  if (!best?.artworkUrl100) return { id: track.id, matched: false };
  return {
    id: track.id,
    imageUrl: artworkSize(best.artworkUrl100),
    album: best.collectionName,
    sourceUrl: best.trackViewUrl,
    previewUrl: best.previewUrl,
    source: "itunes",
    matched: true,
  };
}

function spotifyConfigured() {
  return Boolean(runtime.SPOTIFY_CLIENT_ID && runtime.SPOTIFY_CLIENT_SECRET);
}

async function getSpotifyToken() {
  if (spotifyToken && spotifyToken.expiresAt > Date.now() + 60_000) return spotifyToken.value;
  if (!runtime.SPOTIFY_CLIENT_ID || !runtime.SPOTIFY_CLIENT_SECRET) return undefined;
  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${btoa(`${runtime.SPOTIFY_CLIENT_ID}:${runtime.SPOTIFY_CLIENT_SECRET}`)}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!response.ok) return undefined;
  const payload = (await response.json()) as { access_token?: string; expires_in?: number };
  if (!payload.access_token) return undefined;
  spotifyToken = {
    value: payload.access_token,
    expiresAt: Date.now() + Math.max(60, payload.expires_in || 3600) * 1000,
  };
  return spotifyToken.value;
}

async function searchSpotifyArtwork(track: ArtworkRequestTrack): Promise<ArtworkResult> {
  const token = await getSpotifyToken();
  if (!token) return { id: track.id, matched: false };
  const leadArtist = track.artist.split(",")[0].trim();
  const params = new URLSearchParams({
    q: `track:${track.title} artist:${leadArtist}`,
    type: "track",
    market: "US",
    limit: "10",
  });
  const response = await fetch(`https://api.spotify.com/v1/search?${params}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  if (!response.ok) return { id: track.id, matched: false };
  const payload = (await response.json()) as { tracks?: { items?: SpotifyTrack[] } };
  const ranked = (payload.tracks?.items || [])
    .map((candidate) => ({
      candidate,
      score: matchScore(track, {
        trackName: candidate.name,
        artistName: candidate.artists?.map((artist) => artist.name).filter(Boolean).join(", "),
        trackTimeMillis: candidate.duration_ms,
      }),
    }))
    .filter((item) => item.score >= 7 && item.candidate.album?.images?.some((image) => image.url))
    .sort((a, b) => b.score - a.score);
  const best = ranked[0]?.candidate;
  const image = best?.album?.images?.find((item) => item.url)?.url;
  if (!best || !image) return { id: track.id, matched: false };
  return {
    id: track.id,
    imageUrl: image,
    album: best.album?.name,
    sourceUrl: best.external_urls?.spotify,
    previewUrl: best.preview_url || undefined,
    source: "spotify",
    matched: true,
  };
}

async function ensureCache() {
  await runtime.DB.prepare(
    "CREATE TABLE IF NOT EXISTS artwork_cache (cache_key TEXT PRIMARY KEY, image_url TEXT, album TEXT, source_url TEXT, preview_url TEXT, provider TEXT NOT NULL DEFAULT 'itunes', matched INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL)",
  ).run();
  try {
    await runtime.DB.prepare("ALTER TABLE artwork_cache ADD COLUMN preview_url TEXT").run();
  } catch {
    // Existing databases already have the column after the first successful upgrade.
  }
}

async function lookup(track: ArtworkRequestTrack): Promise<ArtworkResult> {
  const key = cacheKey(track);
  const cached = await runtime.DB.prepare(
    "SELECT image_url, album, source_url, preview_url, provider, matched, updated_at FROM artwork_cache WHERE cache_key = ? LIMIT 1",
  )
    .bind(key)
    .first<{ image_url: string | null; album: string | null; source_url: string | null; preview_url: string | null; provider: "spotify" | "itunes"; matched: number; updated_at: number }>();
  const freshFor = cached?.matched ? 30 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
  const canUseCache = cached?.preview_url && (!spotifyConfigured() || cached.provider === "spotify");
  if (canUseCache && Date.now() - cached.updated_at < freshFor) {
    return {
      id: track.id,
      imageUrl: cached.image_url || undefined,
      album: cached.album || undefined,
      sourceUrl: cached.source_url || undefined,
      previewUrl: cached.preview_url || undefined,
      source: cached.provider,
      matched: Boolean(cached.matched),
    };
  }

  let result: ArtworkResult = spotifyConfigured()
    ? await searchSpotifyArtwork(track).catch(() => ({ id: track.id, matched: false }))
    : { id: track.id, matched: false };
  const itunesResult = await searchArtwork(track).catch(() => ({ id: track.id, matched: false } as ArtworkResult));
  if (!result.matched) result = itunesResult;
  else if (!result.previewUrl && itunesResult.previewUrl) result = { ...result, previewUrl: itunesResult.previewUrl };
  await runtime.DB.prepare(
    "INSERT INTO artwork_cache (cache_key,image_url,album,source_url,preview_url,provider,matched,updated_at) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(cache_key) DO UPDATE SET image_url=excluded.image_url,album=excluded.album,source_url=excluded.source_url,preview_url=excluded.preview_url,provider=excluded.provider,matched=excluded.matched,updated_at=excluded.updated_at",
  )
    .bind(
      key,
      result.imageUrl || null,
      result.album || null,
      result.sourceUrl || null,
      result.previewUrl || null,
      result.source || "itunes",
      result.matched ? 1 : 0,
      Date.now(),
    )
    .run();
  return result;
}

async function mapWithConcurrency<T, R>(items: T[], task: (item: T) => Promise<R>) {
  const results = new Array<R>(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
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
    await ensureCache();
    const body = (await request.json()) as { tracks?: ArtworkRequestTrack[] };
    const unique = new Map<string, ArtworkRequestTrack>();
    for (const track of body.tracks || []) {
      if (!track.id || !track.title?.trim() || !track.artist?.trim()) continue;
      if (track.title.length > 200 || track.artist.length > 200) continue;
      const key = cacheKey(track);
      if (!unique.has(key)) unique.set(key, track);
      if (unique.size >= MAX_TRACKS) break;
    }
    const results = await mapWithConcurrency([...unique.values()], lookup);
    return Response.json({ results });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Artwork lookup failed." },
      { status: 500 },
    );
  }
}
