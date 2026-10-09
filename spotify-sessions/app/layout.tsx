import type { Metadata } from "next";
import "./globals.css";
import "./icon-alignment.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"),
  title: "Spotify Sessions: Group listening, planned together",
  description: "Connect Spotify profiles, shape a shared listening arc, generate a playlist, and play it together.",
  openGraph: {
    title: "Spotify Sessions: Group listening, planned together",
    description: "An interactive group-listening planner by Anika Kasula.",
    type: "website",
    images: [{ url: "/og.png", width: 1680, height: 945, alt: "Spotify Sessions independent product concept" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Spotify Sessions: Group listening, planned together",
    description: "An interactive group-listening planner by Anika Kasula.",
    images: ["/og.png"],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
