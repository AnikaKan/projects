import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "CheckoutIQ — Payment Reliability & Recovery", description: "A simulated payment reliability, recovery, and operations engineering prototype." };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body>{children}</body></html>; }
