import type { MDXComponents } from "mdx/types";
import React, { ReactNode } from "react";
import { CodeBlock } from "@/components/docs/mdx/CodeBlock";
import { Callout } from "@/components/docs/mdx/Callout";
import { Steps } from "@/components/docs/mdx/Steps";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/docs/mdx/Tabs";
import { Card, CardGrid } from "@/components/docs/mdx/Card";

// Recursively extract text content from React children
function extractTextContent(children: ReactNode): string {
  if (typeof children === "string") {
    return children;
  }
  if (typeof children === "number") {
    return String(children);
  }
  if (Array.isArray(children)) {
    return children.map(extractTextContent).join("");
  }
  if (React.isValidElement(children)) {
    const props = children.props as { children?: ReactNode };
    if (props.children) {
      return extractTextContent(props.children);
    }
  }
  return "";
}

export function useMDXComponents(components: MDXComponents): MDXComponents {
  return {
    // Override default elements
    pre: ({ children }) => {
      // Runtime validation - ensure children is a valid React element with expected props
      if (!React.isValidElement(children)) {
        // Fallback to default pre for unexpected content
        return <pre>{children}</pre>;
      }

      // Safely extract props with type narrowing
      const props = children.props as { className?: string; children?: ReactNode } | undefined;
      const className = props?.className || "";

      // Extract raw text for copy button, but pass tokenized children for rendering
      const rawText = props?.children ? extractTextContent(props.children) : "";

      return (
        <CodeBlock className={className} rawText={rawText}>
          {props?.children}
        </CodeBlock>
      );
    },
    // Custom components available in MDX
    Callout,
    Steps,
    Tabs,
    TabsList,
    TabsTrigger,
    TabsContent,
    Card,
    CardGrid,
    ...components,
  };
}
