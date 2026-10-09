/* eslint-disable @typescript-eslint/no-explicit-any */
import type { FeatureSource, MoodProbability, TrackFeatures } from "./session.ts";

const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));

export type ProviderTrack = {
  spotifyTrackId: string;
  isrc?: string;
  title: string;
  artist: string;
  duration: number;
};

export type ProviderResult = {
  provider: "musimap" | "acousticbrainz";
  providerTrackId?: string;
  musicbrainzId?: string;
  matchConfidence: number;
  features?: TrackFeatures;
  reason?: string;
};

export type MusiMapConfig = {
  clientId: string;
  clientSecret: string;
  scope?: string;
};

type TokenState = { accessToken: string; expiresAt: number; key: string };
let tokenState: TokenState | undefined;

const DEFAULT_MUSIMAP_SCOPE = "audio.tagging.read catalog.read";

const probability = (model: any, label: string) =>
  Number(model?.all?.[label] ?? (model?.value === label ? model?.probability : undefined));

const feature = (
  value: number | undefined,
  confidence: number,
  source: FeatureSource = "acousticbrainz",
) =>
  Number.isFinite(value)
    ? {
        value: value as number,
        confidence: clamp(confidence),
        source,
        measuredAt: new Date().toISOString(),
      }
    : undefined;

const normalizeLoudness = (db: number) => clamp((db + 24) / 20);

const asNumber = (...values: unknown[]) => {
  for (const value of values) {
    if (value === null || value === undefined || value === "") continue;
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return undefined;
};

const normalizedScore = (value: unknown) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return undefined;
  return clamp(number > 1 ? number / 100 : number);
};

const normalizeLabel = (value: unknown) => String(value ?? "").trim().toLowerCase();

type MusiMapTag = { name: string; score: number; category: string };

function collectMusiMapTags(payload: any): MusiMapTag[] {
  const tagRoot =
    payload?.data?.audio_tagging?.tags ??
    payload?.audio_tagging?.tags ??
    payload?.data?.tags ??
    payload?.tags ??
    {};
  const collected: MusiMapTag[] = [];
  const add = (item: any, category = "") => {
    const name = normalizeLabel(item?.name ?? item?.label ?? item?.tag_name);
    const score = normalizedScore(item?.score ?? item?.probability ?? item?.confidence);
    if (name && score !== undefined) collected.push({ name, score, category: normalizeLabel(category) });
  };
  if (Array.isArray(tagRoot)) tagRoot.forEach((item) => add(item, item?.category ?? item?.category_slug));
  else if (tagRoot && typeof tagRoot === "object") {
    Object.entries(tagRoot).forEach(([category, items]) => {
      if (Array.isArray(items)) items.forEach((item) => add(item, category));
    });
  }
  return collected;
}

function tagScore(tags: MusiMapTag[], labels: string[], categories: string[] = []) {
  const candidates = tags.filter(
    (tag) =>
      labels.some((label) => tag.name === label || tag.name.includes(label)) &&
      (!categories.length || categories.some((category) => tag.category.includes(category))),
  );
  return candidates.sort((left, right) => right.score - left.score)[0]?.score;
}

function signedMoodScore(tags: MusiMapTag[], positive: string[], negative: string[]) {
  const high = tagScore(tags, positive);
  const low = tagScore(tags, negative);
  if (high === undefined && low === undefined) return undefined;
  if (high !== undefined && low !== undefined) return clamp((high + (1 - low)) / 2);
  return high ?? (low === undefined ? undefined : 1 - low);
}

export function parseMusiMapFeatures(payload: unknown): TrackFeatures | undefined {
  const data = (payload as any)?.data ?? payload;
  const audioTagging = data?.audio_tagging ?? data?.tagging ?? data;
  const raw = data?.audio_features ?? data?.features ?? audioTagging?.audio_features ?? {};
  const tags = collectMusiMapTags(payload);
  const confidence = clamp(
    normalizedScore(
      audioTagging?.confidence ?? data?.match_confidence ?? data?.confidence ?? raw?.confidence ?? 0.82,
    ) ?? 0.82,
  );

  const rawEnergy = asNumber(raw?.energy, raw?.perceptual?.energy, audioTagging?.energy);
  const energy =
    rawEnergy === undefined
      ? signedMoodScore(tags, ["high energy", "energetic", "powerful"], ["low energy", "calm"])
      : normalizedScore(rawEnergy);
  const rawDanceability = asNumber(raw?.danceability, raw?.perceptual?.danceability);
  const danceability =
    rawDanceability === undefined
      ? tagScore(tags, ["danceable", "high danceability"], ["danceability", "movement"])
      : normalizedScore(rawDanceability);
  const valence =
    normalizedScore(asNumber(raw?.valence)) ??
    signedMoodScore(tags, ["happy", "joyful", "uplifting", "positive"], ["sad", "melancholic", "negative"]);
  const arousal =
    normalizedScore(asNumber(raw?.arousal)) ??
    signedMoodScore(tags, ["energetic", "exciting", "aggressive"], ["relaxed", "calm", "peaceful"]);
  const bpm = asNumber(raw?.bpm, raw?.tempo, data?.bpm, data?.tempo);
  const loudness = asNumber(raw?.loudness, raw?.loudness_db, raw?.integrated_loudness);
  const rawInstrumentalness = asNumber(
    raw?.instrumentalness,
    raw?.instrumental,
    audioTagging?.instrumentalness,
  );
  const instrumentalness =
    rawInstrumentalness === undefined
      ? signedMoodScore(tags, ["instrumental", "no vocals", "non-vocal"], ["vocal", "vocals", "sung"])
      : normalizedScore(rawInstrumentalness);
  const moodCategories = tags.filter((tag) => tag.category.includes("mood"));
  const moods: MoodProbability[] = moodCategories
    .map((tag) => ({ label: tag.name, probability: tag.score }))
    .sort((left, right) => right.probability - left.probability)
    .slice(0, 8);

  const features: TrackFeatures = {
    energy: feature(energy, confidence, "musimap"),
    valence: feature(valence, confidence, "musimap"),
    arousal: feature(arousal, confidence, "musimap"),
    danceability: feature(danceability, confidence, "musimap"),
    bpm: feature(bpm, confidence, "musimap"),
    loudness: feature(loudness, confidence, "musimap"),
    instrumentalness: feature(instrumentalness, confidence, "musimap"),
    moods: moods.length ? moods : undefined,
    modelVersion: String(audioTagging?.taxonomy_version ?? data?.model_version ?? "musimap-v1"),
  };

  return features.energy ||
    features.valence ||
    features.arousal ||
    features.danceability ||
    features.bpm ||
    features.loudness ||
    features.instrumentalness ||
    features.moods
    ? features
    : undefined;
}

async function musiMapToken(config: MusiMapConfig) {
  const key = `${config.clientId}:${config.scope ?? DEFAULT_MUSIMAP_SCOPE}`;
  if (tokenState && tokenState.key === key && tokenState.expiresAt > Date.now() + 60_000) {
    return tokenState.accessToken;
  }
  const response = await fetch("https://api.musimap.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: config.clientId,
      client_secret: config.clientSecret,
      scope: config.scope ?? DEFAULT_MUSIMAP_SCOPE,
    }),
  });
  if (!response.ok) throw new Error(`MusiMap authentication failed (${response.status}).`);
  const result = (await response.json()) as { access_token?: string; expires_in?: number };
  if (!result.access_token) throw new Error("MusiMap did not return an access token.");
  tokenState = {
    accessToken: result.access_token,
    expiresAt: Date.now() + Math.max(60, result.expires_in ?? 3600) * 1000,
    key,
  };
  return tokenState.accessToken;
}

export async function fetchMusiMapByIsrc(
  track: ProviderTrack,
  config: MusiMapConfig,
): Promise<ProviderResult> {
  if (!track.isrc) {
    return { provider: "musimap", matchConfidence: 0, reason: "Spotify did not provide an ISRC." };
  }
  const token = await musiMapToken(config);
  const response = await fetch(
    `https://api.musimap.com/v1/audio/tagging/results?isrc=${encodeURIComponent(track.isrc)}`,
    { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } },
  );
  if (response.status === 404) {
    return {
      provider: "musimap",
      matchConfidence: 0,
      reason: "This ISRC is not analyzed in the accessible MusiMap catalog.",
    };
  }
  if (!response.ok) {
    return {
      provider: "musimap",
      matchConfidence: 0,
      reason: `MusiMap catalog lookup failed (${response.status}).`,
    };
  }
  const payload = await response.json();
  const features = parseMusiMapFeatures(payload);
  const data = (payload as any)?.data ?? payload;
  return {
    provider: "musimap",
    providerTrackId: String(data?.track_id ?? data?.track?.id ?? "") || undefined,
    matchConfidence: features ? 0.95 : 0,
    features,
    reason: features ? undefined : "MusiMap matched the ISRC but returned no supported measurements.",
  };
}

export async function testMusiMapConnection(config: MusiMapConfig) {
  const token = await musiMapToken(config);
  const response = await fetch("https://api.musimap.com/v1/me", {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  if (!response.ok) throw new Error(`MusiMap connection test failed (${response.status}).`);
  const payload = (await response.json()) as any;
  const data = payload?.data ?? payload;
  return {
    catalogId: data?.catalog_id ?? data?.default_catalog_id ?? null,
    scopes: Array.isArray(data?.scopes) ? data.scopes : [],
    capabilities: Array.isArray(data?.capabilities) ? data.capabilities : [],
    hasAtlasAccess:
      Boolean(data?.entitlements?.includes?.("musimap_catalog")) ||
      Boolean(data?.capabilities?.includes?.("musimap_catalog")),
  };
}

export async function fetchAcousticBrainz(track: ProviderTrack): Promise<ProviderResult> {
  if (!track.isrc)
    return { provider: "acousticbrainz", matchConfidence: 0, reason: "Spotify did not provide an ISRC." };
  const mb = await fetch(
    `https://musicbrainz.org/ws/2/isrc/${encodeURIComponent(track.isrc)}?fmt=json`,
    {
      headers: {
        Accept: "application/json",
        "User-Agent":
          "SessionsPlaylist/1.0 (https://spotify-sessions-app-anika.anixkas105.chatgpt.site)",
      },
    },
  );
  if (!mb.ok)
    return {
      provider: "acousticbrainz",
      matchConfidence: 0,
      reason: `MusicBrainz lookup failed (${mb.status}).`,
    };
  const data = (await mb.json()) as {
    recordings?: { id: string; title?: string; length?: number; "artist-credit"?: { name?: string }[] }[];
  };
  const recordings = data.recordings || [];
  if (!recordings.length)
    return {
      provider: "acousticbrainz",
      matchConfidence: 0,
      reason: "No MusicBrainz recording matched this ISRC.",
    };
  const key = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const selected = [...recordings].sort((left, right) => {
    const score = (item: (typeof recordings)[number]) =>
      (key(item.title || "") === key(track.title) ? 2 : 0) +
      (key(item["artist-credit"]?.map((artist) => artist.name).join(" ") || "").includes(
        key(track.artist.split(",")[0]),
      )
        ? 2
        : 0) -
      Math.min(2, Math.abs((item.length || track.duration * 1000) - track.duration * 1000) / 30000);
    return score(right) - score(left);
  })[0];
  const matchConfidence = clamp(
    0.65 +
      (key(selected.title || "") === key(track.title) ? 0.2 : 0) +
      (Math.abs((selected.length || track.duration * 1000) - track.duration * 1000) < 3000 ? 0.15 : 0),
  );
  const [lowResponse, highResponse] = await Promise.all([
    fetch(`https://acousticbrainz.org/api/v1/${selected.id}/low-level`),
    fetch(`https://acousticbrainz.org/api/v1/${selected.id}/high-level`),
  ]);
  if (!lowResponse.ok && !highResponse.ok)
    return {
      provider: "acousticbrainz",
      musicbrainzId: selected.id,
      matchConfidence,
      reason: "This recording is not present in the AcousticBrainz archive.",
    };
  const low = lowResponse.ok ? ((await lowResponse.json()) as any) : {};
  const high = highResponse.ok ? ((await highResponse.json()) as any) : {};
  const bpm = Number(low?.rhythm?.bpm);
  const danceability = Number(low?.rhythm?.danceability);
  const loudness = Number(low?.lowlevel?.average_loudness);
  const party = probability(high?.highlevel?.mood_party, "party");
  const relaxed = probability(high?.highlevel?.mood_relaxed, "relaxed");
  const happy = probability(high?.highlevel?.mood_happy, "happy");
  const aggressive = probability(high?.highlevel?.mood_aggressive, "aggressive");
  const energyParts = [
    Number.isFinite(party) ? party : undefined,
    Number.isFinite(relaxed) ? 1 - relaxed : undefined,
    Number.isFinite(danceability) ? danceability : undefined,
    Number.isFinite(bpm) ? clamp((bpm - 70) / 100) : undefined,
    Number.isFinite(loudness) ? normalizeLoudness(loudness) : undefined,
  ].filter((value): value is number => value !== undefined);
  const energy = energyParts.length
    ? energyParts.reduce((sum, value) => sum + value, 0) / energyParts.length
    : undefined;
  const arousal =
    Number.isFinite(aggressive) && Number.isFinite(party) ? clamp((aggressive + party) / 2) : energy;
  const valence = Number.isFinite(happy) ? happy : undefined;
  const moods: MoodProbability[] = [
    ["happy", happy],
    ["party", party],
    ["relaxed", relaxed],
    ["aggressive", aggressive],
  ]
    .filter((item): item is [string, number] => Number.isFinite(item[1]))
    .map(([label, value]) => ({ label, probability: value }))
    .sort((a, b) => b.probability - a.probability);
  const confidence = clamp(matchConfidence * (highResponse.ok ? 0.82 : 0.58));
  return {
    provider: "acousticbrainz",
    musicbrainzId: selected.id,
    matchConfidence,
    features: {
      energy: feature(energy, confidence),
      valence: feature(valence, confidence),
      arousal: feature(arousal, confidence),
      danceability: feature(danceability, matchConfidence * 0.8),
      bpm: feature(bpm, matchConfidence * 0.88),
      loudness: feature(loudness, matchConfidence * 0.82),
      moods,
      modelVersion: "acousticbrainz-2022-archive",
    },
  };
}
