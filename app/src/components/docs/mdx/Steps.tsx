"use client";

import { memo, ReactNode, Children } from "react";

interface StepsProps {
  children: ReactNode;
}

export const Steps = memo(function Steps({ children }: StepsProps) {
  const items = Children.toArray(children);

  return (
    <ol className="docs-steps">
      {items.map((child, index) => (
        <li key={index} className="docs-step">
          <div className="docs-step-marker">{index + 1}</div>
          <div className="docs-step-content">{child}</div>
        </li>
      ))}
    </ol>
  );
});
