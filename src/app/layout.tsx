import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "BriefAgent — a chief of staff that cites its sources",
  description:
    "Ask a research question. BriefAgent plans the work, reads real sources, and hands back a short brief where every claim carries a citation — with your approval at both checkpoints.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
