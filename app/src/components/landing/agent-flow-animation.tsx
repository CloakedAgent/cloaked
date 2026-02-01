"use client";

import React from "react";
import { motion } from "motion/react";
import { Folder, Bot, Shield } from "lucide-react";
import { cn } from "@/lib/utils";

interface AgentFlowAnimationProps {
  className?: string;
}

export function AgentFlowAnimation({ className }: AgentFlowAnimationProps) {
  return (
    <div
      className={cn(
        "relative flex h-[350px] w-full max-w-[500px] flex-col items-center",
        className
      )}
    >
      {/* SVG Paths  */}
      <svg
        className="h-full sm:w-full text-muted"
        width="100%"
        height="100%"
        viewBox="0 0 200 100"
      >
        <g
          stroke="currentColor"
          fill="none"
          strokeWidth="0.4"
          strokeDasharray="100 100"
          pathLength="100"
        >
          <path d="M 31 10 v 15 q 0 5 5 5 h 59 q 5 0 5 5 v 10" />
          <path d="M 77 10 v 10 q 0 5 5 5 h 13 q 5 0 5 5 v 10" />
          <path d="M 124 10 v 10 q 0 5 -5 5 h -14 q -5 0 -5 5 v 10" />
          <path d="M 170 10 v 15 q 0 5 -5 5 h -60 q -5 0 -5 5 v 10" />
          {/* Animation For Path Starting */}
          <animate
            attributeName="stroke-dashoffset"
            from="100"
            to="0"
            dur="1s"
            fill="freeze"
            calcMode="spline"
            keySplines="0.25,0.1,0.5,1"
            keyTimes="0; 1"
          />
        </g>
        {/* Green Lights */}
        <g mask="url(#db-mask-1)">
          <circle
            className="database db-light-1"
            cx="0"
            cy="0"
            r="12"
            fill="url(#db-green-grad)"
          />
        </g>
        <g mask="url(#db-mask-2)">
          <circle
            className="database db-light-2"
            cx="0"
            cy="0"
            r="12"
            fill="url(#db-green-grad)"
          />
        </g>
        <g mask="url(#db-mask-3)">
          <circle
            className="database db-light-3"
            cx="0"
            cy="0"
            r="12"
            fill="url(#db-green-grad)"
          />
        </g>
        <g mask="url(#db-mask-4)">
          <circle
            className="database db-light-4"
            cx="0"
            cy="0"
            r="12"
            fill="url(#db-green-grad)"
          />
        </g>
        {/* Buttons */}
        <g stroke="currentColor" fill="none" strokeWidth="0.4">
          {/* First Button - CREATE */}
          <g>
            <rect fill="#18181B" x="8" y="4" width="46" height="12" rx="6" />
            <DatabaseIcon x="13" y="7" />
            <text x="24" y="12" fill="white" stroke="none" fontSize="5.5" fontWeight="500">
              CREATE
            </text>
          </g>
          {/* Second Button - FUND */}
          <g>
            <rect fill="#18181B" x="58" y="4" width="38" height="12" rx="6" />
            <DatabaseIcon x="63" y="7" />
            <text x="74" y="12" fill="white" stroke="none" fontSize="5.5" fontWeight="500">
              FUND
            </text>
          </g>
          {/* Third Button - DEPLOY */}
          <g>
            <rect fill="#18181B" x="102" y="4" width="44" height="12" rx="6" />
            <DatabaseIcon x="107" y="7" />
            <text x="118" y="12" fill="white" stroke="none" fontSize="5.5" fontWeight="500">
              DEPLOY
            </text>
          </g>
          {/* Fourth Button - MONITOR */}
          <g>
            <rect fill="#18181B" x="148" y="4" width="48" height="12" rx="6" />
            <DatabaseIcon x="153" y="7" />
            <text x="164" y="12" fill="white" stroke="none" fontSize="5.5" fontWeight="500">
              MONITOR
            </text>
          </g>
        </g>
        <defs>
          <mask id="db-mask-1">
            <path
              d="M 31 10 v 15 q 0 5 5 5 h 59 q 5 0 5 5 v 10"
              strokeWidth="0.5"
              stroke="white"
            />
          </mask>
          <mask id="db-mask-2">
            <path
              d="M 77 10 v 10 q 0 5 5 5 h 13 q 5 0 5 5 v 10"
              strokeWidth="0.5"
              stroke="white"
            />
          </mask>
          <mask id="db-mask-3">
            <path
              d="M 124 10 v 10 q 0 5 -5 5 h -14 q -5 0 -5 5 v 10"
              strokeWidth="0.5"
              stroke="white"
            />
          </mask>
          <mask id="db-mask-4">
            <path
              d="M 170 10 v 15 q 0 5 -5 5 h -60 q -5 0 -5 5 v 10"
              strokeWidth="0.5"
              stroke="white"
            />
          </mask>
          {/* Green Gradient for beams */}
          <radialGradient id="db-green-grad" fx="1">
            <stop offset="0%" stopColor="#10b981" />
            <stop offset="100%" stopColor="transparent" />
          </radialGradient>
        </defs>
      </svg>
      {/* Main Box */}
      <div className="absolute bottom-10 flex w-full flex-col items-center">
        {/* bottom shadow */}
        <div className="absolute -bottom-4 h-[100px] w-[62%] rounded-lg bg-[#10b981]/20" />
        {/* box title */}
        <div className="absolute -top-3 z-20 flex items-center justify-center rounded-lg border border-white/10 bg-[#101112] px-3 py-1.5 sm:-top-4 sm:py-2">
          <Shield className="size-4 text-[#10b981]" />
          <span className="ml-2 text-xs text-white/80">
            Cloaked Agent Infrastructure on Solana
          </span>
        </div>
        {/* box outter circle - Green */}
        <div className="absolute -bottom-8 z-30 grid h-[65px] w-[65px] place-items-center rounded-full border-t border-[#10b981]/30 bg-[#141516] font-semibold text-sm text-[#10b981]">
          SOL
        </div>
        {/* box content */}
        <div className="relative z-10 flex h-[150px] w-full items-center justify-center overflow-hidden rounded-lg border border-white/10 bg-black/60 backdrop-blur-xl shadow-md">
          {/* Badges */}
          <div className="absolute bottom-8 left-12 z-10 h-8 rounded-full bg-[#101112] px-3 text-sm border border-white/10 flex items-center gap-2 text-white/80">
            <Bot className="size-4 text-[#10b981]" />
            <span>Research Agent</span>
          </div>
          <div className="absolute right-16 z-10 hidden h-8 rounded-full bg-[#101112] px-3 text-sm sm:flex border border-white/10 items-center gap-2 text-white/80">
            <Folder className="size-4 text-[#8B5CF6]" />
            <span>Data Analyst</span>
          </div>
          {/* Circles - Green colored */}
          <motion.div
            className="absolute -bottom-14 h-[100px] w-[100px] rounded-full border-t border-[#10b981]/20 bg-[#10b981]/5"
            animate={{
              scale: [0.98, 1.02, 0.98, 1, 1, 1, 1, 1, 1],
            }}
            transition={{ duration: 2, repeat: Infinity }}
          />
          <motion.div
            className="absolute -bottom-20 h-[145px] w-[145px] rounded-full border-t border-[#10b981]/15 bg-[#10b981]/5"
            animate={{
              scale: [1, 1, 1, 0.98, 1.02, 0.98, 1, 1, 1],
            }}
            transition={{ duration: 2, repeat: Infinity }}
          />
          <motion.div
            className="absolute -bottom-[100px] h-[190px] w-[190px] rounded-full border-t border-[#10b981]/10 bg-[#10b981]/5"
            animate={{
              scale: [1, 1, 1, 1, 1, 0.98, 1.02, 0.98, 1, 1],
            }}
            transition={{ duration: 2, repeat: Infinity }}
          />
          <motion.div
            className="absolute -bottom-[120px] h-[235px] w-[235px] rounded-full border-t border-[#10b981]/5 bg-[#10b981]/5"
            animate={{
              scale: [1, 1, 1, 1, 1, 1, 0.98, 1.02, 0.98, 1],
            }}
            transition={{ duration: 2, repeat: Infinity }}
          />
        </div>
      </div>
    </div>
  );
}

export default AgentFlowAnimation;

const DatabaseIcon = ({ x = "0", y = "0" }: { x: string; y: string }) => {
  return (
    <svg
      x={x}
      y={y}
      xmlns="http://www.w3.org/2000/svg"
      width="5"
      height="5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="white"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <ellipse cx="12" cy="5" rx="9" ry="3" />
      <path d="M3 5V19A9 3 0 0 0 21 19V5" />
      <path d="M3 12A9 3 0 0 0 21 12" />
    </svg>
  );
};
