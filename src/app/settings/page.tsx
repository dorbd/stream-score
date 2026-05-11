import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { ProviderSelector } from "@/components/ProviderSelector";

export const metadata = {
  title: "My services · stream·score",
};

export default function SettingsPage() {
  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-muted)]">
          Settings
        </div>
        <h1 className="font-display text-4xl leading-tight tracking-tight sm:text-5xl">
          My streaming services
        </h1>
        <p className="max-w-2xl text-sm text-[var(--color-muted)]">
          Pick the services you have access to. We&apos;ll prioritize movies
          you can actually watch and add a small score boost for matches. Your
          selection is saved in your browser only — no account, no sync, no
          tracking.
        </p>
      </section>

      <section className="rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)]/40 p-5 sm:p-6">
        <ProviderSelector />
      </section>

      <div className="flex justify-end">
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-2xl bg-[var(--color-accent)] px-5 py-3 text-sm font-semibold text-zinc-900 hover:brightness-105"
        >
          Find something to watch
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </div>
  );
}
