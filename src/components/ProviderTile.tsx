"use client";
import Image from "next/image";
import { motion } from "motion/react";
import { getBrandSwatch } from "@/lib/providerBrands";
import { cn } from "@/lib/cn";
import type { ProviderTag } from "@/lib/types";

interface Props {
  provider: ProviderTag;
  action: "stream" | "rent" | "buy" | "free" | "ads";
  included?: boolean;
  href?: string | null;
  onClick?: () => void;
}

const ACTION_LABEL: Record<Props["action"], string> = {
  stream: "Stream",
  rent: "Rent",
  buy: "Buy",
  free: "Free",
  ads: "Free w/ ads",
};

export function ProviderTile({ provider, action, included = false, href, onClick }: Props) {
  const brand = getBrandSwatch(provider.key);
  const fgClass = brand.fg === "light" ? "text-white" : "text-zinc-900";

  const inner = (
    <>
      {included && (
        <span className="absolute inset-0 rounded-2xl ring-2 ring-[var(--color-accent)] ring-offset-2 ring-offset-[var(--color-bg)]" />
      )}
      <div
        className="flex h-full w-full flex-col items-center justify-center gap-1.5 px-2 py-3"
        style={{
          background: included
            ? `linear-gradient(135deg, ${brand.bg}, ${brand.bg}dd)`
            : brand.bg,
        }}
      >
        {provider.logoUrl ? (
          <div className="relative h-7 w-7 overflow-hidden rounded-md bg-white/10">
            <Image src={provider.logoUrl} alt={provider.name} fill sizes="28px" className="object-contain" />
          </div>
        ) : (
          <span className={cn("text-xs font-bold uppercase tracking-wider", fgClass)}>
            {provider.name.slice(0, 3)}
          </span>
        )}
        <span className={cn("line-clamp-1 max-w-full px-0.5 text-center text-[10px] font-medium", fgClass)}>
          {provider.name}
        </span>
        <span
          className={cn(
            "rounded-md px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider backdrop-blur",
            brand.fg === "light" ? "bg-black/30 text-white" : "bg-white/30 text-zinc-900",
          )}
        >
          {included ? "Included" : ACTION_LABEL[action]}
        </span>
      </div>
    </>
  );

  const className = cn(
    "group relative block aspect-square overflow-hidden rounded-2xl transition",
    !included && "opacity-95 hover:opacity-100",
  );

  if (href) {
    return (
      <motion.a
        href={href}
        target="_blank"
        rel="noreferrer"
        whileHover={{ y: -2, scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        transition={{ duration: 0.15 }}
        className={className}
        title={`${provider.name} — ${ACTION_LABEL[action]}`}
      >
        {inner}
      </motion.a>
    );
  }
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileHover={{ y: -2, scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      transition={{ duration: 0.15 }}
      className={className}
    >
      {inner}
    </motion.button>
  );
}
