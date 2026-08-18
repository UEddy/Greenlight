import type { Metadata } from "next";
import { Web3Provider } from "@/components/Web3Provider";
import "./globals.css";

export const metadata: Metadata = {
  title: "GreenLight",
  description:
    "An honest read on your visa odds, before you pay the fee. Grounded in published refusal statistics.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,800&family=IBM+Plex+Mono:wght@400;500;600&family=Public+Sans:ital,wght@0,400;0,600;1,400&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen">
        <Web3Provider>
        <div className="mx-auto flex min-h-screen w-full max-w-3xl flex-col px-4 sm:px-6">
          <header className="flex items-baseline gap-3 py-6">
            <a
              href="/"
              className="text-lg font-extrabold tracking-tight text-[#e8ecf4]"
              style={{ fontFamily: "var(--font-display)" }}
            >
              GreenLight
            </a>
            <span className="text-xs text-[#8fa0bd]">
              honest odds, before the fee
            </span>
            <a href="/trip" className="ml-auto text-xs text-[#8fa0bd] underline underline-offset-2">
              Trip escrow
            </a>
          </header>

          <main className="flex-1 pb-12">{children}</main>

          <footer className="border-t border-[var(--color-ink-line)] py-6 text-xs leading-relaxed text-[#7f8ea9]">
            <p>
              GreenLight helps you present your real situation clearly and
              completely. It will never suggest inflating a balance, borrowing
              money to season a bank statement, overstating employment or
              misrepresenting your ties. A refusal for misrepresentation carries
              multi year bans, which is worse than the refusal it was trying to
              avoid.
            </p>
            <p className="mt-3">
              Every figure shown traces to a published government source with the
              year next to it. Refusal rates are population base rates for a
              group, not your personal odds. Where coverage is missing this app
              says so rather than guessing.
            </p>
          </footer>
        </div>
        </Web3Provider>
      </body>
    </html>
  );
}
