"use client";
import { useEffect, useState } from "react";
import { FastAverageColor } from "fast-average-color";
import { motion } from "motion/react";

export function AmbientBackdrop({
  posterUrl,
  backdropUrl,
}: {
  posterUrl: string | null;
  backdropUrl: string | null;
}) {
  const [color, setColor] = useState<string | null>(null);

  useEffect(() => {
    const src = posterUrl ?? backdropUrl;
    if (!src) return;
    let canceled = false;
    const fac = new FastAverageColor();
    const img = new window.Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const result = fac.getColor(img);
        if (!canceled && result?.hex) setColor(result.hex);
      } catch {
        /* ignore */
      }
    };
    img.src = src;
    return () => {
      canceled = true;
      fac.destroy();
    };
  }, [posterUrl, backdropUrl]);

  if (!color) return null;
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 0.6 }}
      transition={{ duration: 1.2 }}
      aria-hidden
      className="pointer-events-none fixed inset-x-0 top-0 -z-10 h-[70vh]"
      style={{
        background: `radial-gradient(ellipse 80% 70% at 50% 0%, ${color}, transparent 60%)`,
      }}
    />
  );
}
