"use client"

import { cn } from "@/lib/utils"
import type React from "react"
import { type CSSProperties, useEffect, useRef, useState } from "react"

const VELOCITY_CONSTANT = 50

interface InfiniteSliderProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode
  gap?: number
  duration?: number
  durationOnHover?: number
  reverse?: boolean
  speed?: number
  speedOnHover?: number
}

export function InfiniteSlider({
  children,
  gap = 48,
  duration,
  durationOnHover,
  reverse = false,
  speed,
  speedOnHover,
  className,
  ...props
}: InfiniteSliderProps) {
  const childrenArray = Array.isArray(children) ? children : [children]
  const [key, setKey] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const [childrenWidth, setChildrenWidth] = useState(0)
  const [isHovered, setIsHovered] = useState(false)

  useEffect(() => {
    if (containerRef.current) {
      const firstChild = containerRef.current.querySelector("[data-animated]")
      if (firstChild) {
        setChildrenWidth(firstChild.getBoundingClientRect().width)
      }
    }
  }, [childrenArray])

  const animationDuration = duration || childrenWidth / (speed || VELOCITY_CONSTANT)
  const animationDurationOnHover =
    durationOnHover || childrenWidth / (speedOnHover || VELOCITY_CONSTANT)

  useEffect(() => {
    setKey((prev) => prev + 1)
  }, [isHovered])

  return (
    <div
      ref={containerRef}
      className={cn("group flex overflow-hidden", className)}
      style={{
        gap: `${gap}px`,
        maskImage:
          "linear-gradient(to right, transparent, black 10%, black 90%, transparent)",
        WebkitMaskImage:
          "linear-gradient(to right, transparent, black 10%, black 90%, transparent)",
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      {...props}
    >
      {Array.from({ length: 2 }).map((_, index) => (
        <div
          key={`${index}-${key}`}
          data-animated
          className="flex shrink-0 items-center justify-around"
          style={
            {
              gap: `${gap}px`,
              animationName: reverse ? "scroll-reverse" : "scroll",
              animationDuration: isHovered
                ? `${animationDurationOnHover}s`
                : `${animationDuration}s`,
              animationTimingFunction: "linear",
              animationIterationCount: "infinite",
              animationPlayState: "running",
              animationDelay: "0s",
              animationDirection: "normal",
              "--gap": `${gap}px`,
            } as CSSProperties
          }
        >
          {childrenArray.map((child, childIndex) => (
            <div key={childIndex}>{child}</div>
          ))}
        </div>
      ))}
      <style jsx>{`
        @keyframes scroll {
          0% {
            transform: translateX(0);
          }
          100% {
            transform: translateX(calc(-100% - var(--gap)));
          }
        }
        @keyframes scroll-reverse {
          0% {
            transform: translateX(calc(-100% - var(--gap)));
          }
          100% {
            transform: translateX(0);
          }
        }
      `}</style>
    </div>
  )
}
