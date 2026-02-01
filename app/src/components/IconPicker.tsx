"use client";

import { memo } from "react";
import { AgentIconType, AGENT_ICONS, getAgentIconSvg } from "@/lib/agentIcons";

interface IconPickerProps {
  value: AgentIconType;
  onChange: (icon: AgentIconType) => void;
}

export const IconPicker = memo(function IconPicker({ value, onChange }: IconPickerProps) {
  return (
    <div className="flex gap-5 p-4 bg-[#050505] border border-[#1a1a1a] rounded-xl items-center">
      {/* Selected icon preview */}
      <div className="w-[72px] h-[72px] rounded-xl bg-[#8b5cf6]/10 border border-[#8b5cf6]/30 flex items-center justify-center text-[#8b5cf6] shrink-0">
        {getAgentIconSvg(value, { className: "w-9 h-9" })}
      </div>

      {/* Divider */}
      <div className="w-px h-16 bg-[#1a1a1a]" />

      {/* Icon grid - auto-fill */}
      <div className="flex-1 grid grid-cols-6 gap-3">
        {AGENT_ICONS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            onClick={() => onChange(id)}
            title={label}
            className={`
              h-10 rounded-lg flex items-center justify-center transition-all
              ${
                value === id
                  ? "bg-[#8b5cf6]/20 border border-[#8b5cf6] text-[#8b5cf6]"
                  : "bg-[#0a0a0a] border border-[#1a1a1a] text-zinc-500 hover:border-zinc-600 hover:text-zinc-300"
              }
            `}
          >
            {getAgentIconSvg(id, { className: "w-5 h-5" })}
          </button>
        ))}
      </div>
    </div>
  );
});
