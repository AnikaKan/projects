"use client";

import { ArrowLeft, Check, Copy, ExternalLink, Music2, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { SpotifyPkceService, SPOTIFY_REDIRECT_URI } from "../../lib/spotify";
import styles from "./page.module.css";

const DASHBOARD_URL = "https://developer.spotify.com/dashboard/80fff8cbaa604190b08f9ebfd5940d24";
const spotify = new SpotifyPkceService();

export default function SpotifySetup() {
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [connectionOptions] = useState(() => {
    if (typeof window === "undefined") return { returnTo: "/", publicPlaylist: false };
    const params = new URLSearchParams(window.location.search);
    const requestedReturn = params.get("return");
    return {
      returnTo: requestedReturn?.startsWith("/") && !requestedReturn.startsWith("//") ? requestedReturn : "/",
      publicPlaylist: params.get("public") === "true",
    };
  });

  const copyCallback = async () => {
    try {
      await navigator.clipboard.writeText(SPOTIFY_REDIRECT_URI);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      setError("Copy did not work. Select the address below and copy it manually.");
    }
  };

  const continueToSpotify = async () => {
    setBusy(true);
    setError("");
    try {
      await spotify.connect(connectionOptions.publicPlaylist, connectionOptions.returnTo);
    } catch {
      setBusy(false);
      setError("Spotify could not open. Check your connection and try again.");
    }
  };

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link href="/" className={styles.brand}><span><Music2 /></span>Sessions</Link>
        <span className={styles.secure}><ShieldCheck /> Limited beta access</span>
      </header>

      <section className={styles.shell}>
        <Link href="/" className={styles.back}><ArrowLeft /> Back to Sessions</Link>
        <div className={styles.hero}>
          <span>Spotify setup</span>
          <h1>Connect your listening taste</h1>
          <p>Sessions asks Spotify for your profile and top music so it can represent your taste in a shared playlist. Your Spotify password is never shared with Sessions.</p>
        </div>

        <div className={styles.grid}>
          <article className={styles.primaryCard}>
            <div className={styles.number}>1</div>
            <div>
              <h2>Continue securely with Spotify</h2>
              <p>Spotify connection is available to allowlisted beta testers. Spotify will show the permissions Sessions is requesting, and you can cancel or disconnect at any time.</p>
              <ul>
                <li><Check /> Read your profile</li>
                <li><Check /> Read your top artists and tracks</li>
                <li><Check /> Create a playlist when you choose Save</li>
              </ul>
              <button className={styles.continue} onClick={continueToSpotify} disabled={busy}>
                <Music2 /> {busy ? "Opening Spotify..." : "Continue with Spotify"}
              </button>
              {error && <p role="alert" className={styles.error}>{error}</p>}
            </div>
          </article>

          <article className={styles.helpCard}>
            <span className={styles.eyebrow}>Connection help</span>
            <h2>If Spotify says the redirect URI does not match</h2>
            <p>The app owner needs to add this exact address in Spotify Developer Dashboard under Settings, Redirect URIs.</p>
            <div className={styles.callback}>
              <code>{SPOTIFY_REDIRECT_URI}</code>
              <button onClick={copyCallback} aria-label="Copy Spotify callback URL">
                {copied ? <Check /> : <Copy />}{copied ? "Copied" : "Copy"}
              </button>
            </div>
            <a className={styles.dashboard} href={DASHBOARD_URL} target="_blank" rel="noreferrer">
              Open Spotify app settings <ExternalLink />
            </a>
            <div className={styles.note}>
              <strong>Using Development Mode?</strong>
              <p>The app owner needs Spotify Premium. Each tester must be added under User Management before they can connect.</p>
            </div>
          </article>
        </div>
      </section>
    </main>
  );
}
