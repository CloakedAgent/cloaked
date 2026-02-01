"use client";

import { memo, ReactNode } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

interface CardProps {
  title: string;
  href?: string;
  children: ReactNode;
}

export const Card = memo(function Card({ title, href, children }: CardProps) {
  const content = (
    <>
      <h3 className="docs-card-title">
        {title}
        {href && <ArrowRight className="w-4 h-4 ml-2 opacity-0 group-hover:opacity-100 transition-opacity" />}
      </h3>
      <div className="docs-card-content">{children}</div>
    </>
  );

  if (href) {
    return (
      <Link href={href} className="docs-card docs-card-link group">
        {content}
      </Link>
    );
  }

  return <div className="docs-card">{content}</div>;
});

interface CardGridProps {
  children: ReactNode;
}

export const CardGrid = memo(function CardGrid({ children }: CardGridProps) {
  return <div className="docs-card-grid">{children}</div>;
});
