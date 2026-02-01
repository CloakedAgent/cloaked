"use client";

import { memo, ReactNode } from "react";

interface GlassCardProps {
  children: ReactNode;
  className?: string;
  elevated?: boolean;
  hover?: boolean;
  padding?: "none" | "sm" | "md" | "lg";
}

const PADDING_MAP = {
  none: "",
  sm: "p-4",
  md: "p-6",
  lg: "p-8",
} as const;

export const GlassCard = memo(function GlassCard({
  children,
  className = "",
  elevated = false,
  hover = false,
  padding = "md",
}: GlassCardProps) {
  const baseClass = elevated ? "glass-card-elevated" : "glass-card";
  const hoverClass = hover ? "card-hover cursor-pointer" : "";
  const paddingClass = PADDING_MAP[padding];

  return (
    <div className={`${baseClass} ${hoverClass} ${paddingClass} ${className}`}>
      {children}
    </div>
  );
});
