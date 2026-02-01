"use client";

import { InputHTMLAttributes, forwardRef } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  suffix?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, suffix, className = "", ...props }, ref) => {
    return (
      <div className="w-full">
        {label && (
          <label className="block text-sm text-[var(--cloak-text-secondary)] mb-2">
            {label}
          </label>
        )}
        <div className="relative">
          <input
            ref={ref}
            className={`input-field ${suffix ? "pr-16" : ""} ${className}`}
            {...props}
          />
          {suffix && (
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[var(--cloak-text-muted)]">
              {suffix}
            </span>
          )}
        </div>
        {error && (
          <p className="text-[var(--cloak-error)] text-sm mt-1">{error}</p>
        )}
      </div>
    );
  }
);

Input.displayName = "Input";
