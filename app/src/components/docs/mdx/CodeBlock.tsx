"use client";

import { useState, useCallback, memo, ReactNode } from "react";
import { Check, Copy } from "lucide-react";

interface CodeBlockProps {
  children: ReactNode;
  rawText: string;
  className?: string;
}

export const CodeBlock = memo(function CodeBlock({
  children,
  rawText,
  className = "",
}: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  // Extract language from className (e.g., "language-typescript" or "language-typescript code-highlight")
  const languageMatch = className.match(/language-(\w+)/);
  const language = languageMatch ? languageMatch[1] : "text";

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(rawText.trim());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [rawText]);

  return (
    <div className="docs-code-block group">
      <div className="docs-code-header">
        <span className="docs-code-language">{language}</span>
        <button
          onClick={handleCopy}
          className="docs-code-copy"
          aria-label="Copy code"
        >
          {copied ? (
            <Check className="w-4 h-4 text-emerald-400" />
          ) : (
            <Copy className="w-4 h-4" />
          )}
        </button>
      </div>
      <pre className={`${className} docs-code-pre`}>
        <code>{children}</code>
      </pre>
    </div>
  );
});
