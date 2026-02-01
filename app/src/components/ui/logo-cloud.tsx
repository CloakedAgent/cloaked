import React from "react"
import Image from "next/image"
import { InfiniteSlider } from "@/components/ui/infinite-slider";
import { cn } from "@/lib/utils";

type Logo = {
  src: string;
  alt: string;
  width?: number;
  height?: number;
  opacity?: number;
};

type LogoCloudProps = React.ComponentProps<"div"> & {
  logos: Logo[];
  speed?: number;
};

export function LogoCloud({ className, logos, speed = 25, ...props }: LogoCloudProps) {
  return (
    <div
      {...props}
      className={cn(
        "overflow-hidden py-4",
        className
      )}
    >
      <InfiniteSlider gap={64} speed={speed} speedOnHover={12}>
        {logos.map((logo) => (
          <Image
            alt={logo.alt}
            className="pointer-events-none select-none hover:opacity-100 transition-opacity duration-300"
            height={logo.height || 72}
            width={logo.width || 72}
            key={`logo-${logo.alt}`}
            src={logo.src || "/placeholder.svg"}
            style={{ height: `${logo.height || 72}px`, width: 'auto', opacity: logo.opacity ?? 0.6 }}
          />
        ))}
      </InfiniteSlider>
    </div>
  );
}
