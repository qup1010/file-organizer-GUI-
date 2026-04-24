"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

export function EmptyState({ 
  icon: Icon, 
  title, 
  description, 
  className,
  children
}: { 
  icon: any; 
  title: string; 
  description: string; 
  className?: string; 
  children?: React.ReactNode;
}) {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn("flex flex-col items-center justify-center text-center p-8", className)}
    >
      <div className="group relative flex w-full max-w-[420px] flex-col items-center gap-6 overflow-hidden rounded-2xl border border-on-surface/10 bg-surface-container-lowest/50 px-8 py-12 ring-1 ring-black/[0.02]">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/5 text-primary/60 ring-1 ring-primary/10 transition-transform duration-500 group-hover:scale-105 group-hover:rotate-3">
          <Icon className="h-8 w-8" />
        </div>
        <div className="max-w-[320px] space-y-2">
          <h3 className="text-[17px] font-black tracking-tight text-on-surface">{title}</h3>
          <p className="text-[13px] font-medium leading-relaxed text-ui-muted opacity-60">{description}</p>
        </div>

        {children ? <div className="pt-2">{children}</div> : null}
      </div>
    </motion.div>
  );
}
