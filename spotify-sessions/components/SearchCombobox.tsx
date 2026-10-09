"use client";
/* eslint-disable @next/next/no-img-element */
import { useEffect, useId, useState } from "react";
import { LoaderCircle, Search } from "lucide-react";
import { SpotifyPkceService, type SpotifyArtistResult, type SpotifyTrackResult } from "../lib/spotify";
const spotify = new SpotifyPkceService();
type Item = SpotifyArtistResult | SpotifyTrackResult;
type Props = { kind: "artist" | "track"; selectedIds: string[]; onSelect: (item: Item) => void; label: string };
export default function SearchCombobox({ kind, selectedIds, onSelect, label }: Props) {
  const id = useId();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Item[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [active, setActive] = useState(0);
  useEffect(() => {
    if (query.trim().length < 2) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setBusy(true); setError("");
      try {
        const response = await fetch(`/api/catalog/search?kind=${kind}&q=${encodeURIComponent(query)}`, { signal: controller.signal });
        if (!response.ok) {
          if (spotify.isConnected()) {
            const connectedResults = kind === "artist" ? await spotify.searchArtists(query, controller.signal) : await spotify.searchTracks(query, controller.signal);
            setResults(connectedResults.filter((item) => !selectedIds.includes(item.id)).slice(0, 5)); setActive(0); return;
          }
          const payload = await response.json().catch(() => ({})) as { error?: string };
          throw new Error(payload.error || "Catalog search failed.");
        }
        const payload = await response.json() as { results?: Item[] };
        const next = payload.results || [];
        setResults(next.filter((item) => !selectedIds.includes(item.id)).slice(0, 5)); setActive(0);
      } catch (reason) { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Search failed."); }
      finally { if (!controller.signal.aborted) setBusy(false); }
    }, 300);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [query, kind, selectedIds]);
  const choose = (item: Item) => { onSelect(item); setQuery(""); setResults([]); };
  const visible = query.trim().length >= 2 ? results : [];
  return <div className="search-combobox"><label htmlFor={id}>{label}</label><div className="search-input"><Search/><input id={id} value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Search Spotify ${kind}s`} role="combobox" aria-expanded={Boolean(visible.length)} aria-controls={`${id}-list`} onKeyDown={(event) => { if (event.key === "ArrowDown") { event.preventDefault(); setActive((index) => Math.min(index + 1, visible.length - 1)); } if (event.key === "ArrowUp") { event.preventDefault(); setActive((index) => Math.max(index - 1, 0)); } if (event.key === "Enter" && visible[active]) { event.preventDefault(); choose(visible[active]); } if (event.key === "Escape") { setResults([]); setQuery(""); } }}/>{busy&&<LoaderCircle className="spin"/>}</div>{query.length>0&&query.length<2&&<small>Type at least 2 characters</small>}{error&&<p className="search-error" role="alert">{error}</p>}{query.length>=2&&!busy&&!error&&!visible.length&&<p className="search-empty">No results found</p>}{visible.length>0&&<div className="search-results" id={`${id}-list`} role="listbox">{visible.map((item,index)=><button type="button" key={item.id} className={index===active?"active":""} role="option" aria-selected={index===active} onMouseDown={(event)=>{event.preventDefault();choose(item)}}>{item.imageUrl?<img src={item.imageUrl} alt=""/>:<span className="art-fallback"><Search/></span>}<span><strong>{"title"in item?item.title:item.name}</strong><small>{"title"in item?`${item.artist} · ${item.album}`:(item.genres||[]).slice(0,2).join(" · ")||"Artist"}</small></span></button>)}</div>}</div>;
}
export function ArtistSearchCombobox(props:Omit<Props,"kind">){return <SearchCombobox {...props} kind="artist"/>}
export function TrackSearchCombobox(props:Omit<Props,"kind">){return <SearchCombobox {...props} kind="track"/>}
