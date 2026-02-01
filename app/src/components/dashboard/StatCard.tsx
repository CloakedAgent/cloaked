"use client";

import { memo, ReactNode } from "react";

interface StatCardProps {
  label: string;
  value: string;
  icon: ReactNode;
  subtitle?: string;
  meta?: ReactNode;
  className?: string;
}

export const StatCard = memo(function StatCard({
  label,
  value,
  icon,
  subtitle,
  meta,
  className = "",
}: StatCardProps) {
  return (
    <div className={`stat-card ${className}`}>
      <div className="stat-card-icon">{icon}</div>
      <span className="stat-card-label">{label}</span>
      <div className="stat-card-value">{value}</div>
      {subtitle && <div className="stat-card-subtitle">{subtitle}</div>}
      {meta && <div className="stat-card-meta">{meta}</div>}
    </div>
  );
});
