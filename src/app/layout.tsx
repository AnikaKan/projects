import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "Drilldown — Interview preparation with evidence", description: "Build defensible stories and practice adaptive product interviews." };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
