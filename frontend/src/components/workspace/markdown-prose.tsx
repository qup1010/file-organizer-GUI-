import React, { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Check, Copy, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

export function CodeBlock({ children, className }: { children: React.ReactNode; className?: string }) {
  const [copied, setCopied] = useState(false);
  const code = String(children).replace(/\n$/, "");

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="group relative my-3 overflow-hidden rounded-[4px] border border-on-surface/8 bg-surface-container-lowest transition-colors">
      <div className="flex items-center justify-between border-b border-on-surface/8 bg-surface-container-low px-3 py-2">
        <span className="text-[12px] font-medium text-ui-muted">代码片段</span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 rounded-[8px] px-2 py-1 text-[12px] font-medium text-on-surface-variant/55 transition-colors hover:bg-on-surface/5 hover:text-on-surface"
        >
          {copied ? <Check className="h-3 w-3 text-success-dim" /> : <Copy className="h-3 w-3" />}
          {copied ? "已复制" : "复制"}
        </button>
      </div>
      <pre className={cn("overflow-x-auto scrollbar-none p-3 font-mono text-[12px] leading-6", className)}>
        {children}
      </pre>
    </div>
  );
}

export function MarkdownProse({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        p: ({ node, ...props }) => <div className="mb-1.5 last:mb-0 text-[14px] leading-7" {...props} />,
        strong: ({ node, ...props }) => <strong className="font-bold text-on-surface" {...props} />,
        em: ({ node, ...props }) => <em className="italic text-on-surface/80" {...props} />,
        ul: ({ node, ...props }) => <ul className="mb-2 ml-4 list-disc space-y-1.5 text-[14px]" {...props} />,
        ol: ({ node, ...props }) => <ol className="mb-2 ml-4 list-decimal space-y-1.5 text-[14px]" {...props} />,
        li: ({ node, ...props }) => (
          <li className={cn("pl-1 leading-7", String(node?.position?.start.line).length > 2 && "ml-4")} {...props} />
        ),
        a: ({ node, ...props }) => (
          <a
            className="text-primary font-bold underline underline-offset-4 hover:text-primary-dim transition-colors inline-flex items-center gap-1 group/link"
            target="_blank"
            rel="noopener noreferrer"
            {...props}
          >
            {props.children}
            <ExternalLink className="w-3 h-3 opacity-30 group-hover/link:opacity-100 transition-opacity" />
          </a>
        ),
        table: ({ node, ...props }) => (
          <div className="my-4 overflow-x-auto rounded-[4px] border border-on-surface/8 bg-surface-container-low">
            <table className="w-full text-left border-collapse text-[13px]" {...props} />
          </div>
        ),
        thead: ({ node, ...props }) => <thead className="bg-surface-container text-[12px] font-semibold text-on-surface-variant/80" {...props} />,
        th: ({ node, ...props }) => <th className="px-3 py-2 border-b border-on-surface/5" {...props} />,
        td: ({ node, ...props }) => <td className="px-3 py-2 border-b border-on-surface/[0.03] leading-relaxed" {...props} />,
        hr: ({ node, ...props }) => <hr className="my-5 border-t border-on-surface/5" {...props} />,
        h1: ({ node, ...props }) => <h1 className="mb-3 mt-4 text-xl font-headline font-bold tracking-tighter text-on-surface" {...props} />,
        h2: ({ node, ...props }) => <h2 className="mb-2.5 mt-4 text-lg font-headline font-bold tracking-tight text-on-surface/90 flex items-center gap-2" {...props} />,
        h3: ({ node, ...props }) => (
          <h3 className="mb-2 mt-3 flex items-center gap-2 text-[14px] font-semibold text-on-surface/70" {...props} />
        ),
        blockquote: ({ node, ...props }) => (
          <blockquote className="my-4 rounded-r-[4px] border-l-4 border-primary/20 bg-primary/[0.03] px-4 py-3 text-on-surface/75 leading-7" {...props} />
        ),
        code: ({ node, inline, className, children, ...props }: any) => {
          if (inline) {
            return <code className="rounded bg-on-surface/5 px-1.5 py-0.5 font-mono text-[0.9em] font-bold text-primary" {...props}>{children}</code>;
          }
          return <CodeBlock className={className}>{children}</CodeBlock>;
        },
        input: ({ node, ...props }: any) => {
          if (props.type === "checkbox") {
            return (
              <input
                type="checkbox"
                readOnly
                checked={props.checked}
                className="w-4 h-4 rounded border-on-surface/10 bg-on-surface/5 text-primary focus:ring-primary/20 transition-all mr-2"
              />
            );
          }
          return <input {...props} />;
        },
      }}
    >
      {content}
    </ReactMarkdown>
  );
}
