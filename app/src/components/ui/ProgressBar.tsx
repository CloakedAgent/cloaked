"use client";

interface ProgressBarProps {
  value: number;
  max: number;
  showLabel?: boolean;
  size?: "sm" | "md";
  glow?: boolean;
  formatValue?: (value: number) => string;
  className?: string;
}

export function ProgressBar({
  value,
  max,
  showLabel = true,
  size = "md",
  glow = false,
  formatValue,
  className = "",
}: ProgressBarProps) {
  const percentage = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  const isUnlimited = max === 0;

  const heightClass = size === "sm" ? "h-1" : "h-1.5";

  const format = formatValue || ((v: number) => `${(v / 1e9).toFixed(2)} SOL`);

  return (
    <div className={`w-full ${className}`}>
      {showLabel && (
        <div className="flex justify-between items-center mb-2 text-sm">
          <span className="text-[var(--cloak-text-secondary)]">
            {format(value)}
            {!isUnlimited && (
              <span className="text-[var(--cloak-text-muted)]">
                {" "}/ {format(max)}
              </span>
            )}
          </span>
          {!isUnlimited && (
            <span className="text-[var(--cloak-text-muted)]">
              {percentage.toFixed(0)}%
            </span>
          )}
        </div>
      )}
      <div className={`progress-track ${heightClass}`}>
        {isUnlimited ? (
          <div
            className="progress-fill"
            style={{ width: "100%", opacity: 0.3 }}
          />
        ) : (
          <div
            className={`progress-fill ${glow ? "progress-glow" : ""}`}
            style={{ width: `${percentage}%` }}
          />
        )}
      </div>
    </div>
  );
}
