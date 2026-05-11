import type { Metadata } from "next";
import { Geist, Geist_Mono, Instrument_Serif } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";
import { Header } from "@/components/Header";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const instrumentSerif = Instrument_Serif({
  variable: "--font-instrument-serif",
  subsets: ["latin"],
  weight: "400",
});

export const metadata: Metadata = {
  title: "stream·score — what should I watch tonight?",
  description:
    "Movie discovery filtered by the streaming services you actually pay for. Every movie, ranked by what matters — and where to watch it.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${instrumentSerif.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <Header />
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-16 pt-4 sm:px-6 sm:pt-6">
          {children}
        </main>
        <footer className="mx-auto w-full max-w-6xl px-4 pb-10 pt-4 text-xs text-[var(--color-subtle)] sm:px-6">
          Movie data via{" "}
          <a
            className="underline-offset-2 hover:underline"
            href="https://www.themoviedb.org/"
            target="_blank"
            rel="noreferrer"
          >
            TMDb
          </a>
          {" · "}Ratings via{" "}
          <a
            className="underline-offset-2 hover:underline"
            href="https://www.omdbapi.com/"
            target="_blank"
            rel="noreferrer"
          >
            OMDb
          </a>
          {" · "}Availability via{" "}
          <a
            className="underline-offset-2 hover:underline"
            href="https://www.justwatch.com/"
            target="_blank"
            rel="noreferrer"
          >
            JustWatch
          </a>
          . Not endorsed by any of them.
        </footer>
        <Toaster
          theme="dark"
          position="bottom-center"
          toastOptions={{
            style: {
              background: "oklch(0.22 0.012 270)",
              color: "oklch(0.97 0.005 270)",
              border: "1px solid oklch(0.32 0.014 270 / 0.8)",
            },
          }}
        />
      </body>
    </html>
  );
}
