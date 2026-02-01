"use client";

type Status = "active" | "frozen" | "expired";

interface StatusBadgeProps {
  status: Status;
  showDot?: boolean;
  className?: string;
}

const statusConfig = {
  active: {
    label: "Active",
    badgeClass: "badge-active",
    dotClass: "status-active",
  },
  frozen: {
    label: "Shrouded",
    badgeClass: "badge-frozen",
    dotClass: "status-frozen",
  },
  expired: {
    label: "Expired",
    badgeClass: "badge-expired",
    dotClass: "status-expired",
  },
};

export function StatusBadge({
  status,
  showDot = true,
  className = "",
}: StatusBadgeProps) {
  const config = statusConfig[status];

  return (
    <span className={`badge ${config.badgeClass} ${className}`}>
      {showDot && <span className={`status-dot ${config.dotClass}`} />}
      {config.label}
    </span>
  );
}

export function StatusDot({ status }: { status: Status }) {
  const config = statusConfig[status];
  return <span className={`status-dot ${config.dotClass}`} />;
}
