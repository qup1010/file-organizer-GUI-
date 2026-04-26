"use client";

import React from "react";
import { ChevronDown, ChevronUp, ArrowRight } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { cn } from "@/lib/utils";
import type { PlanItem } from "@/types/session";
import { fileExtension } from "./preview-utils";

interface QueueCardProps {
  title: string;
  items: PlanItem[];
  selectedItemId: string | null;
  onSelectItem: (itemId: string) => void;
  onShowAll: () => void;
  tone: string;
  resolveTargetLabel: (item: PlanItem) => string;
}

export function QueueCard({
  title,
  items,
  selectedItemId,
  onSelectItem,
  onShowAll,
  tone,
  resolveTargetLabel,
}: QueueCardProps) {
  if (items.length === 0) return null;
  return (
    <section className={cn("rounded-lg border overflow-hidden", tone)}>
      <div className="flex items-center justify-between gap-3 border-b border-inherit bg-on-surface/[0.03] px-4 py-2">
        <div className="flex items-center gap-2">
          <h3 className="text-[12px] font-black uppercase tracking-wider opacity-80">{title}</h3>
          <span className="rounded-full bg-on-surface/10 px-2 py-0.5 text-[10px] font-black tabular-nums">{items.length}</span>
        </div>
        <button 
          type="button" 
          onClick={onShowAll} 
          className="rounded-[4px] bg-on-surface/5 px-2.5 py-1 text-[10px] font-black uppercase tracking-tight hover:bg-on-surface/10 transition-all"
        >
          查看全部
        </button>
      </div>
      <div className="p-1.5 flex flex-col gap-1">
        {items.slice(0, 4).map((item) => (
          <button
            key={item.item_id}
            type="button"
            onClick={() => onSelectItem(item.item_id)}
            className={cn(
              "group relative flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left transition-all",
              selectedItemId === item.item_id 
                ? "border-on-surface/20 bg-surface ring-1 ring-on-surface/5" 
                : "border-transparent hover:bg-on-surface/5",
            )}
          >
            <div className="min-w-0 flex-1">
              <p className={cn("truncate font-mono text-[12px] tracking-tight", selectedItemId === item.item_id ? "font-black text-on-surface" : "font-bold text-on-surface/70")}>
                {item.display_name}
              </p>
              <p className="mt-0.5 truncate font-mono text-[10px] text-ui-muted opacity-50">
                {resolveTargetLabel(item)}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
               <span className="font-mono text-[10px] font-bold text-ui-muted/40 uppercase">{fileExtension(item)}</span>
               <ArrowRight className="h-3 w-3 opacity-0 group-hover:opacity-30 transition-opacity" />
            </div>
          </button>
        ))}
        {items.length > 4 && (
          <button type="button" onClick={onShowAll} className="w-full py-2 text-[10.5px] font-black uppercase tracking-widest text-ui-muted/50 hover:text-ui-muted hover:bg-on-surface/5 transition-all rounded-lg">
            还有 {items.length - 4} 项 · 点击展开
          </button>
        )}
      </div>
    </section>
  );
}

interface QueuePanelProps {
  collapsed: boolean;
  queueCount: number;
  unresolvedCount: number;
  reviewCount: number;
  invalidatedCount: number;
  children: React.ReactNode;
  onToggle: () => void;
  actions?: React.ReactNode;
}

export function QueuePanel({
  collapsed,
  queueCount,
  unresolvedCount,
  reviewCount,
  invalidatedCount,
  children,
  onToggle,
  actions,
}: QueuePanelProps) {
  if (queueCount === 0) return null;
  return (
    <aside className="w-full shrink-0 min-w-0">
      <section className="rounded-lg border border-on-surface/10 bg-surface overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-on-surface/8 bg-on-surface/[0.02] px-4 py-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-[13px] font-black uppercase tracking-widest text-on-surface/80">待处理队列</h3>
              <span className="rounded-full bg-warning/10 px-2 py-0.5 text-[10px] font-black text-warning ring-1 ring-warning/20">
                {queueCount}
              </span>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {actions}
            <button
              type="button"
              onClick={onToggle}
              aria-expanded={!collapsed}
              className="inline-flex items-center gap-1.5 rounded-[8px] border border-on-surface/10 bg-surface/95 px-3 py-1.5 text-[11px] font-bold text-on-surface-variant backdrop-blur transition-colors hover:bg-surface-container-low hover:text-on-surface"
            >
              {collapsed ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
              {collapsed ? "展开列表" : "收起"}
            </button>
          </div>
        </div>
        <AnimatePresence initial={false}>
          {!collapsed ? (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="space-y-4 p-4 bg-surface-container-lowest/30">
                {children}
              </div>
            </motion.div>
          ) : (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="flex flex-wrap gap-2 px-4 py-3">
                {invalidatedCount > 0 ? (
                  <span className="rounded-md border border-error/15 bg-error/5 px-2 py-1 text-[10px] font-black uppercase tracking-wider text-error">需重新确认 {invalidatedCount}</span>
                ) : null}
                {unresolvedCount > 0 ? (
                  <span className="rounded-md border border-warning/20 bg-warning/5 px-2 py-1 text-[10px] font-black uppercase tracking-wider text-warning-dim">待决策 {unresolvedCount}</span>
                ) : null}
                {reviewCount > 0 ? (
                  <span className="rounded-md border border-primary/15 bg-primary/5 px-2 py-1 text-[10px] font-black uppercase tracking-wider text-primary">待核对 {reviewCount}</span>
                ) : null}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </section>
    </aside>
  );
}
