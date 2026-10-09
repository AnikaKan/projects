import { env } from "cloudflare:workers";

type RuntimeEnv = {
  SPOTIFY_CLIENT_ID?: string;
  SPOTIFY_CLIENT_SECRET?: string;
};

type SpotifyArtist = {
  id: string;
  name: string;
  genres?: string[];
  images?: { url?: string }[];
};

type SpotifyTrack = {
  id: string;
  uri: string;
  name: string;
  preview_url?: string | null;
  explicit?: boolean;
  duration_ms?: number;
  external_urls?: { spotify?: string };
  external_ids?: { isrc?: string };
  artists?: { id?: string; name?: string }[];
  album?: { name?: string; release_date?: string; images?: { url?: string }[] };
};

const runtime = env as unknown as RuntimeEnv;
let cachedToken: { value: string; expiresAt: number } | undefined;

async function accessToken() {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value;
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
  cachedToken = {
    value: payload.access_token,
    expiresAt: Date.now() + Math.max(60, payload.expires_in || 3600) * 1000,
  };
  return cachedToken.value;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = url.searchParams.get("q")?.trim() || "";
  const kind = url.searchParams.get("kind");
  if (query.length < 2 || query.length > 80 || (kind !== "artist" && kind !== "track")) {
    return Response.json({ error: "Enter at least two characters." }, { status: 400 });
  }

  const token = await accessToken();
  if (!token) return Response.json({ error: "Catalog search is temporarily unavailable." }, { status: 503 });
  const params = new URLSearchParams({ q: query, type: kind, limit: "5" });
  if (kind === "track") params.set("market", "US");
  const response = await fetch(`https://api.spotify.com/v1/search?${params}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  if (!response.ok) return Response.json({ error: "Spotify catalog search failed." }, { status: response.status });

  const payload = (await response.json()) as {
    artists?: { items?: SpotifyArtist[] };
    tracks?: { items?: SpotifyTrack[] };
  };
  const results = kind === "artist"
    ? (payload.artists?.items || []).map((artist) => ({
        id: artist.id,
        name: artist.name,
        genres: artist.genres || [],
        imageUrl: artist.images?.[0]?.url,
      }))
    : (payload.tracks?.items || []).map((track) => ({
        id: track.id,
        uri: track.uri,
        spotifyUrl: track.external_urls?.spotify,
        previewUrl: track.preview_url || undefined,
        isrc: track.external_ids?.isrc,
        title: track.name,
        artist: track.artists?.map((artist) => artist.name).filter(Boolean).join(", ") || "Unknown artist",
        artistId: track.artists?.[0]?.id,
        album: track.album?.name || "",
        imageUrl: track.album?.images?.[0]?.url,
        releaseDate: track.album?.release_date,
        duration: Math.round((track.duration_ms || 0) / 1000),
        explicit: Boolean(track.explicit),
      }));
  return Response.json({ results });
}
