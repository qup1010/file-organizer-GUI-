"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ArrowRight, CheckCircle2, ChevronDown, ChevronRight, ChevronUp, FileText, Folder, FolderOpen, Layers, Search, Sparkles, Edit2, Info, ChevronsDownUp, ChevronsUpDown } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { MarkdownProse } from "./markdown-prose";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogClose } from "@/components/ui/dialog";

import { getSessionStageView } from "@/lib/session-view-model";
import { cn } from "@/lib/utils";
import { canRunPrecheck as deriveCanRunPrecheck } from "@/lib/workspace-precheck";
import type { IncrementalSelectionSnapshot, OrganizeMode, PlacementConfig, PlanItem, PlanSnapshot, PlanTargetSlot, SessionStage, SourceTreeEntry, TargetDirectoryNode } from "@/types/session";

export type PreviewFilter = "all" | "changed" | "unresolved" | "review" | "invalidated";

export interface PreviewFocusRequest {
  token: number;
  itemIds: string[];
  filter?: PreviewFilter;
}

interface PreviewPanelProps {
  plan: PlanSnapshot;
  stage: SessionStage;
  organizeMode?: OrganizeMode;
  isBusy: boolean;
  isPlanSyncing?: boolean;
  plannerStatus?: {
    preservingPreviousPlan: boolean;
    isRunning: boolean;
  } | null;
  plannerRunKey?: string | null;
  readOnly?: boolean;
  onRunPrecheck: () => void;
  onUpdateItem: (itemId: string, payload: { target_dir?: string; target_slot?: string; move_to_review?: boolean }) => Promise<void> | void;
  precheckSummary?: { mkdir_preview?: string[] } | null;
  focusRequest?: PreviewFocusRequest | null;
  sourceTreeEntries?: SourceTreeEntry[];
  incrementalSelection?: IncrementalSelectionSnapshot | null;
}

interface TreeNode {
  name: string;
  path: string;
  kind: "directory" | "file";
  item?: PlanItem;
  sourceEntry?: SourceTreeEntry;
  children: TreeNode[];
}

interface AvailableTargetOption {
  key: string;
  label: string;
  directory: string;
  targetSlotId?: string;
}

type TargetSlotLookup = Map<string, PlanTargetSlot>;

function normalizePath(path: string | null | undefined): string {
  return String(path || "").replace(/\\/g, "/").replace(/^\/+|\/+$/g, "").trim();
}

function isAbsolutePath(path: string | null | undefined): boolean {
  const value = String(path || "").trim();
  return /^[a-zA-Z]:($|[\\/])/.test(value) || value.startsWith("/");
}

function normalizeEntryKind(entryType: string | null | undefined): "directory" | "file" {
  return ["dir", "directory", "folder"].includes(String(entryType || "").toLowerCase()) ? "directory" : "file";
}

function fileExtension(item: Pick<PlanItem | SourceTreeEntry, "display_name" | "source_relpath" | "entry_type">): string {
  if (normalizeEntryKind(item.entry_type) === "directory") return "目录";
  const source = item.display_name || item.source_relpath;
  const ext = source.split(".").pop()?.toLowerCase();
  return ext && ext !== source.toLowerCase() ? ext : "无后缀";
}

function statusMeta(status: PlanItem["status"]) {
  if (status === "unresolved") return { label: "待决策", tone: "bg-warning/10 text-warning border-warning/20" };
  if (status === "review") return { label: "待核对", tone: "bg-primary/10 text-primary border-primary/20" };
  if (status === "invalidated") return { label: "需重确认", tone: "bg-error/10 text-error border-error/20" };
  return { label: "已就绪", tone: "text-success-dim/40 border-transparent" };
}

function acceptedReviewStatusMeta() {
  return { label: "已保留", tone: "border-success/20 bg-success/10 text-success-dim" };
}

function itemStatusMeta(item: PlanItem, acceptedReviewItemIds: string[]) {
  if (item.status === "review" && acceptedReviewItemIds.includes(item.item_id)) {
    return acceptedReviewStatusMeta();
  }
  return statusMeta(item.status);
}

function itemMetaLabel(item: Pick<PlanItem, "item_id" | "target_slot_id">): string {
  return [item.item_id, item.target_slot_id || ""].filter(Boolean).join(" · ");
}

function resolveItemDirectory(item: PlanItem, targetSlotById: TargetSlotLookup, placement: PlacementConfig): string {
    if (item.status === "review" || item.target_slot_id === "Review") return "Review";
  if (item.target_slot_id) {
    const slot = targetSlotById.get(item.target_slot_id);
    if (slot?.relpath) return slot.relpath;
  }
  return "当前目录";
}

function resolveItemTargetPath(item: PlanItem, targetSlotById: TargetSlotLookup, placement: PlacementConfig): string {
  const directoryLabel = resolveItemDirectory(item, targetSlotById, placement);
  const filename = item.display_name || item.source_relpath.split("/").pop() || item.source_relpath;
  return directoryLabel && directoryLabel !== "当前目录" ? `${directoryLabel}/${filename}` : filename;
}

function isItemChanged(item: PlanItem, targetSlotById: TargetSlotLookup, placement: PlacementConfig) {
  return normalizePath(item.source_relpath) !== normalizePath(resolveItemTargetPath(item, targetSlotById, placement));
}

function groupItemsByTargetSlot(items: PlanItem[], targetSlotById: TargetSlotLookup, placement: PlacementConfig) {
  const groups = new Map<string, PlanItem[]>();
  items.forEach((item) => {
    const directory = resolveItemDirectory(item, targetSlotById, placement);
    if (!directory || directory === "当前目录") return;
    const existing = groups.get(directory) || [];
    existing.push(item);
    groups.set(directory, existing);
  });
  return groups;
}

function matchesFilter(item: PlanItem, filter: PreviewFilter, targetSlotById: TargetSlotLookup, placement: PlacementConfig) {
  if (filter === "all") return true;
  if (filter === "changed") return isItemChanged(item, targetSlotById, placement);
  if (filter === "unresolved") return item.status === "unresolved";
  if (filter === "review") return item.status === "review";
  return item.status === "invalidated";
}

function sortTree(root: TreeNode) {
  const sortNode = (node: TreeNode) => {
    node.children.sort((left, right) => {
      if (left.kind !== right.kind) return left.kind === "directory" ? -1 : 1;
      return left.name.localeCompare(right.name, "zh-CN");
    });
    node.children.forEach(sortNode);
  };
  sortNode(root);
  return root.children;
}

function flattenTargetDirectoryTree(nodes: TargetDirectoryNode[]): string[] {
  const result: string[] = [];
  const walk = (items: TargetDirectoryNode[]) => {
    items.forEach((item) => {
      const relpath = normalizePath(item.relpath);
      if (relpath) {
        result.push(relpath);
      }
      if (Array.isArray(item.children) && item.children.length > 0) {
        walk(item.children);
      }
    });
  };
  walk(nodes);
  return result;
}

function buildPlanTree(items: PlanItem[], mkdirPreview: string[], resolveItemPath: (item: PlanItem) => string): TreeNode[] {
  const root: TreeNode = { name: "", path: "", kind: "directory", children: [] };
  const ensureDir = (parts: string[]) => {
    let current = root;
    let currentPath = "";
    for (const part of parts) {
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      let next = current.children.find((child) => child.kind === "directory" && child.name === part);
      if (!next) {
        next = { name: part, path: currentPath, kind: "directory", children: [] };
        current.children.push(next);
      }
      current = next;
    }
    return current;
  };
  mkdirPreview.forEach((dir) => {
    const parts = normalizePath(dir).split("/").filter(Boolean);
    if (parts.length) ensureDir(parts);
  });
  items.forEach((item) => {
    const rawPath = resolveItemPath(item) || item.source_relpath;
    const parts = normalizePath(rawPath).split("/").filter(Boolean);
    if (parts.length === 0) return;
    if (normalizeEntryKind(item.entry_type) === "directory") {
      const directoryNode = ensureDir(parts);
      directoryNode.item = directoryNode.item || item;
      return;
    }
    const filename = parts.pop();
    if (!filename) return;
    const parent = ensureDir(parts);
    parent.children.push({ name: filename, path: normalizePath(rawPath), kind: "file", item, children: [] });
  });
  return sortTree(root);
}

function buildSourceTree(entries: SourceTreeEntry[], itemBySource: Map<string, PlanItem>): TreeNode[] {
  const root: TreeNode = { name: "", path: "", kind: "directory", children: [] };
  const ensureDir = (parts: string[]) => {
    let current = root;
    let currentPath = "";
    for (const part of parts) {
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      let next = current.children.find((child) => child.kind === "directory" && child.name === part);
      if (!next) {
        next = { name: part, path: currentPath, kind: "directory", children: [] };
        current.children.push(next);
      }
      current = next;
    }
    return current;
  };

  entries.forEach((entry) => {
    const entryPath = normalizePath(entry.source_relpath);
    const parts = entryPath.split("/").filter(Boolean);
    if (parts.length === 0) return;
    const linkedItem = itemBySource.get(entryPath);
    if (normalizeEntryKind(entry.entry_type) === "directory") {
      const directoryNode = ensureDir(parts);
      directoryNode.sourceEntry = directoryNode.sourceEntry || entry;
      directoryNode.item = directoryNode.item || linkedItem;
      return;
    }
    const filename = parts.pop();
    if (!filename) return;
    const parent = ensureDir(parts);
    parent.children.push({
      name: filename,
      path: entryPath,
      kind: "file",
      item: linkedItem,
      sourceEntry: entry,
      children: [],
    });
  });

  return sortTree(root);
}

function mappingStatusLabel(status: string | undefined, item?: PlanItem, acceptedReviewItemIds: string[] = []): string {
  if (item && item.status === "review" && acceptedReviewItemIds.includes(item.item_id)) return "已保留";
  if (status === "review") return "待核对";
  if (status === "unresolved") return "待决策";
  if (status === "assigned") return "已分配";
  if (status === "skipped") return "保留原位";
  return "已规划";
}

function TreeBranch({
  node,
  depth,
  expanded,
  selectedItemId,
  onToggle,
  onSelectItem,
  onEditItem,
  acceptedReviewItemIds,
  viewMode,
  targetSlotById,
  placement,
}: {
  node: TreeNode;
  depth: number;
  expanded: Record<string, boolean>;
  selectedItemId: string | null;
  onToggle: (path: string) => void;
  onSelectItem: (itemId: string) => void;
  onEditItem: (itemId: string) => void;
  acceptedReviewItemIds: string[];
  viewMode: "before" | "after";
  targetSlotById: TargetSlotLookup;
  placement: PlacementConfig;
}) {
  const [isHovered, setIsHovered] = useState(false);
  
  if (node.kind === "file") {
    if (node.item) {
      const status = itemStatusMeta(node.item, acceptedReviewItemIds);
      const ItemIcon = normalizeEntryKind(node.item.entry_type) === "directory" ? Folder : FileText;
      const active = selectedItemId === node.item.item_id;
      const hasMoved = viewMode === "after" && isItemChanged(node.item, targetSlotById, placement);

      return (
        <div
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          className="flex flex-col"
        >
          <button
            type="button"
            onClick={() => onSelectItem(node.item!.item_id)}
            className={cn(
              "group relative flex w-full items-center gap-3 py-1.5 pr-2 text-left transition-all border-b border-on-surface/[0.04] last:border-0",
              active ? "bg-primary/[0.06] border-l-2 border-primary" : "hover:bg-on-surface/[0.02]",
            )}
            style={{ paddingLeft: 12 + depth * 16 }}
          >
            <ItemIcon className={cn("h-3.5 w-3.5 shrink-0 transition-colors", active ? "text-primary/70" : "text-on-surface-variant/30")} />
            <div className="min-w-0 flex-1 py-0.5">
              <div className="flex items-center gap-2">
                <p className={cn("truncate font-mono text-[12.5px] tracking-tight transition-colors", active ? "text-primary font-bold" : "text-on-surface/80")}>
                  {node.item.display_name}
                </p>
                {hasMoved && (
                   <span className="truncate text-[9px] font-bold uppercase tracking-tighter text-ui-muted opacity-25 group-hover:opacity-50 transition-opacity whitespace-nowrap">
                      ← {node.item.source_relpath.split('/').slice(0, -1).pop() || "ROOT"}
                   </span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {node.item.status !== "assigned" && node.item.status !== "skipped" && (
                <span className={cn("rounded-[3px] border px-1.5 py-0.5 text-[9px] font-black uppercase tracking-widest shrink-0", status.tone)}>
                  {status.label}
                </span>
              )}
              
              <div
                role="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onEditItem(node.item!.item_id);
                }}
                className={cn(
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-on-surface/10 bg-surface transition-all hover:bg-on-surface/[0.02] active:scale-90",
                  active ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus:opacity-100"
                )}
              >
                <Edit2 className="h-3 w-3 text-on-surface-variant/60" />
              </div>
            </div>
          </button>
          
          <AnimatePresence>
            {(active || isHovered) && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
                style={{ paddingLeft: 34 + depth * 16 }}
              >
                <div className="space-y-1 pb-1.5 pt-0.5 pr-4 border-b border-on-surface/[0.02]">
                  <div className="flex items-center gap-2">
                    <span className="shrink-0 rounded-sm bg-primary/10 px-1 text-[8px] font-black tracking-wider text-primary/70">用途判断</span>
                    <p className="truncate text-[10.5px] font-medium text-ui-muted/70 leading-tight italic">
                      {node.item.suggested_purpose || "根据文件名和内容线索预测"}
                    </p>
                  </div>
                  {node.item.content_summary ? (
                    <div className="flex items-center gap-2">
                      <span className="shrink-0 rounded-sm bg-on-surface/[0.04] px-1 text-[8px] font-black tracking-wider text-ui-muted/50">内容摘要</span>
                      <p className="truncate text-[10.5px] font-medium text-ui-muted/55 leading-tight" title={node.item.content_summary}>
                        {node.item.content_summary}
                      </p>
                    </div>
                  ) : null}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      );
    }

    return (
      <div
        className="flex w-full items-center gap-3 border-b border-on-surface/[0.04] py-2 pr-3 text-left"
        style={{ paddingLeft: 12 + depth * 16 }}
      >
        <FileText className="h-3.5 w-3.5 shrink-0 text-on-surface-variant/20" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-mono text-[12.5px] tracking-tight text-on-surface/50">{node.sourceEntry?.display_name || node.name}</p>
          <p className="truncate text-[10px] font-bold uppercase tracking-wider text-ui-muted opacity-30">Original Item</p>
        </div>
      </div>
    );
  }

  const isExpanded = expanded[node.path] ?? depth < 1;
  return (
    <div className="space-y-0.5">
      <button
        type="button"
        onClick={() => onToggle(node.path)}
        className="group flex w-full items-center gap-2.5 py-1.5 pr-2 text-left transition-colors hover:bg-on-surface/[0.035]"
        style={{ paddingLeft: 8 + depth * 16 }}
      >
        <div className="flex h-4 w-4 shrink-0 items-center justify-center">
            {isExpanded ? (
                <ChevronDown className="h-3 w-3 text-on-surface-variant/40" />
            ) : (
                <ChevronRight className="h-3 w-3 text-on-surface-variant/40" />
            )}
        </div>
        <Folder className={cn("h-3.5 w-3.5 shrink-0 transition-colors", isExpanded ? "text-primary/70" : "text-on-surface/30")} />
        <span className="min-w-0 flex-1 truncate font-mono text-[12.5px] font-black tracking-tight text-on-surface/80">{node.name}</span>
        <span className="font-mono text-[10px] font-bold text-ui-muted/30">{node.children.length}</span>
      </button>
      <AnimatePresence initial={false}>
        {isExpanded ? (
            <motion.div 
              initial={{ opacity: 0, height: 0 }} 
              animate={{ opacity: 1, height: "auto" }} 
              exit={{ opacity: 0, height: 0 }} 
              className="flex flex-col overflow-hidden"
            >
              {node.children.map((child) => (
              <TreeBranch 
                key={child.path} 
                node={child} 
                depth={depth + 1} 
                expanded={expanded} 
                selectedItemId={selectedItemId} 
                onToggle={onToggle} 
                onSelectItem={onSelectItem} 
                onEditItem={onEditItem} 
                acceptedReviewItemIds={acceptedReviewItemIds}
                viewMode={viewMode}
                targetSlotById={targetSlotById}
                placement={placement}
              />
            ))}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function QueueCard({
  title,
  items,
  selectedItemId,
  onSelectItem,
  onShowAll,
  tone,
  resolveTargetLabel,
}: {
  title: string;
  items: PlanItem[];
  selectedItemId: string | null;
  onSelectItem: (itemId: string) => void;
  onShowAll: () => void;
  tone: string;
  resolveTargetLabel: (item: PlanItem) => string;
}) {
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

function QueuePanel({
  collapsed,
  queueCount,
  unresolvedCount,
  reviewCount,
  invalidatedCount,
  children,
  onToggle,
  actions,
}: {
  collapsed: boolean;
  queueCount: number;
  unresolvedCount: number;
  reviewCount: number;
  invalidatedCount: number;
  children: React.ReactNode;
  onToggle: () => void;
  actions?: React.ReactNode;
}) {
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

function IncrementalMappingPanel({
  items,
  selectedItemId,
  onSelectItem,
  onEditItem,
  resolveTargetLabel,
  readOnly = false,
}: {
  items: PlanItem[];
  selectedItemId: string | null;
  onSelectItem: (itemId: string) => void;
  onEditItem: (itemId: string) => void;
  resolveTargetLabel: (item: PlanItem) => string;
  readOnly?: boolean;
}) {
  if (items.length === 0) return null;

  const assignmentCounts = new Map<string, number>();
  items.forEach((item) => {
    const label = resolveTargetLabel(item);
    assignmentCounts.set(label, (assignmentCounts.get(label) || 0) + 1);
  });

  return (
    <section className="rounded-xl border border-on-surface/10 bg-surface-container-low/20 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-0.5">
          <h3 className="text-[13px] font-black uppercase tracking-wider text-on-surface/80">归属映射清单</h3>
          <p className="text-[11.5px] font-medium text-ui-muted opacity-60">实时显示文件与目标目录的映射关系。</p>
        </div>
        <span className="rounded-full border border-on-surface/12 bg-on-surface/5 px-2.5 py-0.5 text-[10px] font-black text-ui-muted">
          {items.length} 条目
        </span>
      </div>

      <div className="mt-4 flex flex-wrap gap-1.5">
        {Array.from(assignmentCounts.entries())
          .sort((a, b) => a[0].localeCompare(b[0], "zh-CN"))
          .slice(0, 8)
          .map(([label, count]) => (
            <span key={label} className="rounded-md border border-primary/15 bg-primary/[0.03] px-2 py-0.5 text-[10px] font-black text-primary/80 transition-colors hover:bg-primary/[0.06]">
              {label} · {count}
            </span>
          ))}
      </div>

      <div className="mt-4 space-y-1">
        {items.map((item) => {
          const status = statusMeta(item.status);
          const targetLabel = resolveTargetLabel(item);
          const slotLabel = item.target_slot_id && item.target_slot_id !== "Review" ? item.target_slot_id : "";
          const active = selectedItemId === item.item_id;

          return (
            <button
              key={item.item_id}
              type="button"
              onClick={() => onSelectItem(item.item_id)}
              className={cn(
                "group relative flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left transition-all",
                active 
                  ? "border-primary/30 bg-surface ring-1 ring-primary/10" 
                  : "border-transparent bg-transparent hover:bg-on-surface/[0.025] hover:border-on-surface/8",
              )}
            >
              <FileText className={cn("h-3.5 w-3.5 shrink-0 transition-colors", active ? "text-primary/70" : "text-on-surface-variant/30")} />
              <div className="min-w-0 flex-1 py-0.5">
                <p className={cn("truncate text-[13px] font-black tracking-tight", active ? "text-primary" : "text-on-surface/90")}>{item.display_name}</p>
                <div className="mt-1 flex items-center gap-1.5 overflow-hidden">
                  <p className="truncate font-mono text-[10.5px] font-medium text-ui-muted opacity-50">
                    {item.source_relpath}
                  </p>
                  <ArrowRight className="h-2.5 w-2.5 shrink-0 text-on-surface/10" />
                  <p className={cn("truncate font-mono text-[10.5px] font-bold", active ? "text-primary/60" : "text-primary/40")}>
                    {targetLabel}
                  </p>
                </div>
              </div>
              
              <div className="flex items-center gap-2 shrink-0">
                {slotLabel ? (
                  <span className="rounded-[4px] border border-primary/10 bg-primary/[0.045] px-1.5 py-0.5 text-[9px] font-black uppercase tracking-widest text-primary">
                    {slotLabel}
                  </span>
                ) : null}
                
                {item.status !== "assigned" && item.status !== "skipped" && (
                  <span className={cn("rounded-[4px] border px-1.5 py-0.5 text-[9px] font-black uppercase tracking-widest", status.tone)}>
                    {status.label}
                  </span>
                )}
                
                {!readOnly && (
                  <div
                    role="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onEditItem(item.item_id);
                    }}
                    className={cn(
                      "flex h-6 w-6 items-center justify-center rounded-md border border-on-surface/10 bg-surface transition-all hover:bg-on-surface/[0.02] active:scale-90",
                      active ? "opacity-100" : "opacity-0 group-hover:opacity-100",
                    )}
                  >
                    <Edit2 className="h-3 w-3 text-on-surface-variant/60" />
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}

export function PreviewPanel(props: PreviewPanelProps) {
  const {
    plan,
    stage,
    organizeMode = "initial",
    isBusy,
    isPlanSyncing = false,
    plannerStatus = null,
    plannerRunKey = null,
    readOnly = false,
    onRunPrecheck,
    onUpdateItem,
    precheckSummary,
    focusRequest,
    sourceTreeEntries = [],
    incrementalSelection = null,
  } = props;
  const stageView = getSessionStageView(stage);
  const allItems = useMemo(() => {
    const merged = new Map<string, PlanItem>();
    [...(plan.items || []), ...(plan.invalidated_items || [])].forEach((item) => {
      if (item?.item_id) {
        merged.set(item.item_id, item);
      }
    });
    return Array.from(merged.values());
  }, [plan.invalidated_items, plan.items]);
  const isPlanningRun = stageView.isPlanning && Boolean(plannerStatus?.isRunning);
  const [viewMode, setViewMode] = useState<"before" | "after">(isPlanningRun ? "before" : "after");
  const [filter, setFilter] = useState<PreviewFilter>("all");
  const [search, setSearch] = useState("");
  const [extensionFilter, setExtensionFilter] = useState("all");
  const [selectedItemId, setSelectedItemId] = useState<string | null>(allItems[0]?.item_id || null);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const editingItem = useMemo(() => allItems.find((item) => item.item_id === editingItemId) || null, [allItems, editingItemId]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [manualTarget, setManualTarget] = useState("");
  const [showManualInput, setShowManualInput] = useState(false);
  const [queueCollapsed, setQueueCollapsed] = useState(false);
  const [acceptedReviewItemIds, setAcceptedReviewItemIds] = useState<string[]>([]);
  const previousPlannerRunKeyRef = useRef<string | null>(null);
  const queuePanelRef = useRef<HTMLDivElement | null>(null);

  const unresolvedItems = useMemo(() => allItems.filter((item) => item.status === "unresolved"), [allItems]);
  const reviewItems = useMemo(() => allItems.filter((item) => item.status === "review"), [allItems]);
  const invalidatedItems = useMemo(() => (plan.invalidated_items || []).map((item) => ({ ...item, status: "invalidated" as const })), [plan.invalidated_items]);
  const reviewItemsPendingAcceptance = useMemo(
    () => reviewItems.filter((item) => !acceptedReviewItemIds.includes(item.item_id)),
    [acceptedReviewItemIds, reviewItems],
  );
  const activeReviewItems = reviewItemsPendingAcceptance;
  const queueCount = invalidatedItems.length + unresolvedItems.length + activeReviewItems.length;
  const itemBySource = useMemo(
    () =>
      new Map(
        allItems
          .filter((item) => normalizePath(item.source_relpath))
          .map((item) => [normalizePath(item.source_relpath), item]),
      ),
    [allItems],
  );

  const extensionOptions = useMemo(
    () => [
      "all",
      ...Array.from(new Set([...allItems, ...sourceTreeEntries].map((item) => fileExtension(item)))).sort((a, b) => a.localeCompare(b, "zh-CN")),
    ],
    [allItems, sourceTreeEntries],
  );
  const targetSlotById = useMemo<TargetSlotLookup>(
    () => new Map((plan.target_slots || []).map((slot) => [slot.slot_id, slot])),
    [plan.target_slots],
  );
  const placement = plan.placement || { new_directory_root: "", review_root: "" };
  const resolveTargetLabel = (item: PlanItem) => resolveItemDirectory(item, targetSlotById, placement);
  const resolveTargetMeta = (item: PlanItem) => {
    const directoryLabel = resolveTargetLabel(item);
    const fullTargetPath = resolveItemTargetPath(item, targetSlotById, placement);
    const slotLabel = item.target_slot_id && item.target_slot_id !== "Review" ? item.target_slot_id : "";
    const mappingLabel = mappingStatusLabel(item.mapping_status || item.status, item, acceptedReviewItemIds);
    return { directoryLabel, fullTargetPath, slotLabel, mappingLabel };
  };
  const reviewTargetUnresolvedItems = useMemo(
    () => unresolvedItems.filter((item) => resolveTargetLabel(item) === "Review"),
    [placement, targetSlotById, unresolvedItems],
  );
  const filteredItems = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return allItems.filter((item) => {
      if (!matchesFilter(item, filter, targetSlotById, placement)) return false;
      if (extensionFilter !== "all" && fileExtension(item) !== extensionFilter) return false;
      if (!keyword) return true;
      return [item.display_name, item.source_relpath, resolveItemTargetPath(item, targetSlotById, placement), resolveTargetLabel(item), item.suggested_purpose || "", item.content_summary || ""]
        .some((value) => value.toLowerCase().includes(keyword));
    });
  }, [allItems, extensionFilter, filter, placement, search, targetSlotById]);
  const filteredSourceEntries = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return sourceTreeEntries.filter((entry) => {
      const linkedItem = itemBySource.get(normalizePath(entry.source_relpath));
      if (filter !== "all" && (!linkedItem || !matchesFilter(linkedItem, filter, targetSlotById, placement))) return false;
      if (extensionFilter !== "all" && fileExtension(entry) !== extensionFilter) return false;
      if (!keyword) return true;
      return [
        entry.display_name,
        entry.source_relpath,
        linkedItem ? resolveTargetLabel(linkedItem) : "",
        linkedItem?.suggested_purpose || "",
        linkedItem?.content_summary || "",
      ].some((value) => value.toLowerCase().includes(keyword));
    });
  }, [extensionFilter, filter, itemBySource, placement, search, sourceTreeEntries, targetSlotById]);
  const selectedItem = useMemo(() => allItems.find((item) => item.item_id === selectedItemId) || null, [allItems, selectedItemId]);
  const mkdirPreview = precheckSummary?.mkdir_preview || [];
  const beforeTree = useMemo(() => buildSourceTree(filteredSourceEntries, itemBySource), [filteredSourceEntries, itemBySource]);
  const afterTree = useMemo(
    () => buildPlanTree(filteredItems, mkdirPreview, (item) => resolveItemTargetPath(item, targetSlotById, placement)),
    [filteredItems, mkdirPreview, placement, targetSlotById],
  );
  const currentTree = viewMode === "before" ? beforeTree : afterTree;
  const flattenedTargetDirectories = useMemo(
    () => flattenTargetDirectoryTree(incrementalSelection?.target_directory_tree || []),
    [incrementalSelection?.target_directory_tree],
  );
  const groupedByTargetSlot = useMemo(() => groupItemsByTargetSlot(allItems, targetSlotById, placement), [allItems, placement, targetSlotById]);
  const availableTargetOptions = useMemo<AvailableTargetOption[]>(() => {
    const options = new Map<string, AvailableTargetOption>();
    options.set("Review", { key: "review", label: "待确认区", directory: "Review" });
    (plan.target_slots || []).forEach((slot: PlanTargetSlot) => {
      const directory = normalizePath(slot.relpath);
      if (!directory) return;
      options.set(directory, {
        key: `slot:${slot.slot_id}`,
        label: directory,
        directory,
        targetSlotId: slot.slot_id,
      });
    });
    if (organizeMode === "incremental") {
      (incrementalSelection?.target_directories || []).forEach((directory) => {
        const normalized = normalizePath(directory);
        if (normalized && !options.has(normalized)) {
          options.set(normalized, { key: `dir:${normalized}`, label: normalized, directory: normalized });
        }
      });
      flattenedTargetDirectories.forEach((directory) => {
        const normalized = normalizePath(directory);
        if (normalized && !options.has(normalized)) {
          options.set(normalized, { key: `dir:${normalized}`, label: normalized, directory: normalized });
        }
      });
    }
    plan.groups.forEach((group) => {
      const normalized = normalizePath(group.directory);
      if (normalized && !options.has(normalized)) {
        options.set(normalized, { key: `dir:${normalized}`, label: normalized, directory: normalized });
      }
    });
    Array.from(groupedByTargetSlot.keys()).forEach((directory) => {
      const dir = normalizePath(directory);
      if (dir && !options.has(dir)) {
        options.set(dir, { key: `dir:${dir}`, label: dir, directory: dir });
      }
    });
    return Array.from(options.values()).sort((a, b) => a.directory.localeCompare(b.directory, "zh-CN"));
  }, [flattenedTargetDirectories, groupedByTargetSlot, incrementalSelection?.target_directories, organizeMode, plan.groups, plan.target_slots, targetSlotById]);
  const availableDirectories = useMemo(() => availableTargetOptions.map((item) => item.directory), [availableTargetOptions]);
  const manualTargetTrimmed = manualTarget.trim();
  const manualTargetInvalid = isAbsolutePath(manualTargetTrimmed) || /^review([\\/]|$)/i.test(manualTargetTrimmed);
  const canRunPrecheck = deriveCanRunPrecheck(stage, plan.readiness, isPlanSyncing);
  const incrementalSummary = useMemo(() => {
    if (organizeMode !== "incremental" || !incrementalSelection) {
      return null;
    }
    return {
      targetCount: incrementalSelection.target_directories.length,
      pendingCount: incrementalSelection.pending_items_count,
      targetDirectories: incrementalSelection.target_directories,
    };
  }, [incrementalSelection, organizeMode]);

  useEffect(() => {
    if (!selectedItem && filteredItems[0]?.item_id) {
      setSelectedItemId(filteredItems[0].item_id);
    }
  }, [filteredItems, selectedItem]);

  useEffect(() => {
    if (!focusRequest) return;
    if (focusRequest.filter) setFilter(focusRequest.filter);
    if (focusRequest.itemIds[0]) setSelectedItemId(focusRequest.itemIds[0]);
  }, [focusRequest]);

  useEffect(() => {
    setManualTarget(editingItem ? (resolveTargetLabel(editingItem) === "当前目录" ? "" : resolveTargetLabel(editingItem)) : "");
  }, [editingItem]);

  useEffect(() => {
    if (editingItem && (editingItem.status === "invalidated" || editingItem.status === "unresolved" || editingItem.status === "review")) {
      setQueueCollapsed(false);
    }
  }, [editingItem]);

  useEffect(() => {
    if (focusRequest?.filter === "invalidated" || focusRequest?.filter === "unresolved" || focusRequest?.filter === "review") {
      setQueueCollapsed(false);
    }
  }, [focusRequest]);

  useEffect(() => {
    setAcceptedReviewItemIds((current) => current.filter((itemId) => reviewItems.some((item) => item.item_id === itemId)));
  }, [reviewItems]);

  const applyItemTarget = async (itemId: string, payload: { target_dir?: string; target_slot?: string; move_to_review?: boolean }) => {
    await Promise.resolve(onUpdateItem(itemId, payload));
  };

  const applyBatch = async (items: PlanItem[], payload: { target_dir?: string; target_slot?: string; move_to_review?: boolean }) => {
    for (const item of items) {
      await applyItemTarget(item.item_id, payload);
    }
  };

  const isAcceptedReviewItem = (item: PlanItem) => item.status === "review" && acceptedReviewItemIds.includes(item.item_id);
  const canAcceptReviewsAndRunPrecheck =
    !readOnly &&
    canRunPrecheck &&
    invalidatedItems.length === 0 &&
    unresolvedItems.length === 0 &&
    activeReviewItems.length > 0;

  const acceptAllReviewItems = async () => {
    const reviewCandidateIds = [
      ...reviewItemsPendingAcceptance.map((item) => item.item_id),
      ...reviewTargetUnresolvedItems.map((item) => item.item_id),
    ];
    if (!reviewCandidateIds.length) {
      return;
    }
    if (reviewTargetUnresolvedItems.length > 0) {
      await applyBatch(reviewTargetUnresolvedItems, { move_to_review: true });
    }
    setAcceptedReviewItemIds((current) => Array.from(new Set([...current, ...reviewCandidateIds])));
    setQueueCollapsed(true);
    if (canAcceptReviewsAndRunPrecheck) {
      await Promise.resolve(onRunPrecheck());
    }
  };

  const focusQueue = () => {
    setQueueCollapsed(false);
    const nextFilter: PreviewFilter | null =
      invalidatedItems.length > 0 ? "invalidated" : unresolvedItems.length > 0 ? "unresolved" : activeReviewItems.length > 0 ? "review" : null;
    if (nextFilter) {
      setFilter(nextFilter);
    }
    queuePanelRef.current?.scrollIntoView?.({ behavior: "smooth", block: "start" });
  };

  const currentExt = editingItem ? fileExtension(editingItem) : null;
  const extMatchedItems = currentExt ? allItems.filter((item) => fileExtension(item) === currentExt) : [];
  const sameSuggestedDirItems = editingItem ? unresolvedItems.filter((item) => resolveTargetLabel(item) === resolveTargetLabel(editingItem) && resolveTargetLabel(item) !== "当前目录") : [];
  const editingTargetMeta = editingItem ? resolveTargetMeta(editingItem) : null;
  const blockingQueueCount = invalidatedItems.length + unresolvedItems.length;
  const pendingQueueCount = invalidatedItems.length + unresolvedItems.length + activeReviewItems.length;
  const reviewQueueCount = activeReviewItems.length;
  const precheckNotice = canRunPrecheck
    ? "待处理项目已清空，可以做移动前安全检查。"
    : invalidatedItems.length > 0
      ? `仍有 ${invalidatedItems.length} 项需重新确认。`
      : unresolvedItems.length > 0
        ? `仍有 ${unresolvedItems.length} 项待决策。`
      : reviewQueueCount > 0
          ? `仍有 ${reviewQueueCount} 项待核对。`
          : isPlanSyncing
            ? "方案正在更新，稍后即可检查。"
            : "方案还没准备好做安全检查。";
  const visibleCount = viewMode === "before" ? filteredSourceEntries.length : filteredItems.length;
  const totalCount = viewMode === "before" ? sourceTreeEntries.length : allItems.length;
  const hasAfterPlanData = allItems.length > 0 || mkdirPreview.length > 0;
  const queueSummaryText = invalidatedItems.length > 0
    ? `需重新确认 ${invalidatedItems.length}`
    : unresolvedItems.length > 0
      ? `待决策 ${unresolvedItems.length}`
      : reviewQueueCount > 0
        ? `待核对 ${reviewQueueCount}`
        : "";

  useEffect(() => {
    const currentRunKey = isPlanningRun ? plannerRunKey || "__planning__" : null;
    if (currentRunKey && currentRunKey !== previousPlannerRunKeyRef.current) {
      setViewMode("before");
      previousPlannerRunKeyRef.current = currentRunKey;
      return;
    }
    if (!currentRunKey) {
      previousPlannerRunKeyRef.current = null;
    }
  }, [isPlanningRun, plannerRunKey]);

  return (
    <div className="flex h-full w-full min-w-0 flex-col bg-transparent @container overflow-hidden">
        <div className="mx-auto flex h-full w-full max-w-[1440px] flex-col min-w-0 px-4 py-4 lg:px-6 overflow-hidden">
          <section className="min-w-0 flex flex-col h-full rounded-[12px] border border-on-surface/8 bg-surface-container-lowest overflow-hidden">
            <div className="shrink-0">
            {plannerStatus?.isRunning && plannerStatus.preservingPreviousPlan ? (
              <div className="border-b border-primary/10 bg-primary/[0.045] px-4 py-3 @lg:px-5">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-[6px] border border-primary/14 bg-primary/8 text-primary">
                    <Sparkles className="h-3.5 w-3.5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[13px] font-bold text-on-surface">正在基于你的最新要求重算方案</p>
                    <p className="mt-1 text-[12px] leading-5 text-on-surface-variant">当前显示的是上一版方案，新方案完成后会自动替换</p>
                  </div>
                </div>
              </div>
            ) : null}
            <div className="border-b border-on-surface/6 px-6 py-3">
              <div className="flex flex-col gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.15em] text-primary/70">
                    <Layers className="h-3.5 w-3.5" />
                    方案预览
                  </div>
                  <span className={cn("rounded-[3px] border px-2 py-0.5 text-[9px] font-black uppercase tracking-widest", pendingQueueCount > 0 || !canRunPrecheck ? "border-warning/30 bg-warning/5 text-warning" : "border-success/30 bg-success/5 text-success-dim")}>
                    {pendingQueueCount > 0 ? `待处理 ${pendingQueueCount}` : canRunPrecheck ? "可检查" : isPlanSyncing ? "更新中" : "待检查"}
                  </span>
                  <div className="flex shrink-0 items-center gap-1.5 rounded-[3px] border border-on-surface/8 bg-on-surface/[0.02] px-2 py-0.5 text-[9px] font-bold text-on-surface uppercase tracking-widest">
                    <Sparkles className="h-2.5 w-2.5 text-primary/60" />
                    <span>移动 {plan.stats.move_count}</span>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5 rounded-[3px] border border-on-surface/8 bg-on-surface/[0.02] px-2 py-0.5 text-[9px] font-bold text-on-surface uppercase tracking-widest">
                    <Folder className="h-2.5 w-2.5 text-primary/60" />
                    <span>新目录 {plan.stats.directory_count}</span>
                  </div>
                </div>

                <div className="flex min-w-0 items-center gap-3">
                  <h2 className="truncate text-[14px] font-bold tracking-tight text-on-surface">先处理待处理项，再核对目标结构</h2>
                  {plan.summary ? (
                    <p className="min-w-0 flex-1 truncate text-[11px] text-ui-muted/80">{plan.summary}</p>
                  ) : null}
                </div>
              </div>

              {incrementalSummary ? (
                <div className="mt-2 flex flex-wrap items-center gap-2 rounded-[10px] border border-primary/10 bg-primary/[0.045] px-3 py-2">
                  <span className="rounded-full bg-surface px-2 py-0.5 text-[10px] font-bold text-primary">
                    归入已有目录
                  </span>
                  <span className="text-[11px] font-semibold text-on-surface">
                    已选目标目录 {incrementalSummary.targetCount} 个
                  </span>
                  <span className="text-[11px] text-ui-muted">
                    待整理项 {incrementalSummary.pendingCount} 个
                  </span>
                  <span className="truncate text-[11px] text-ui-muted">
                    目标池：{incrementalSummary.targetDirectories.join("、") || "未设置"}
                  </span>
                </div>
              ) : null}
            </div>

            <div className="border-b border-on-surface/8 bg-on-surface/[0.02] px-4 py-2">
              <div className="flex flex-wrap items-center gap-3">
                {/* View Switcher: Mechanical Style */}
                <div className="flex shrink-0 items-center rounded-md border border-on-surface/10 bg-on-surface/[0.02] p-0.5">
                  <button 
                    type="button" 
                    onClick={() => setViewMode("before")} 
                    className={cn(
                      "flex items-center gap-1.5 rounded-[4px] px-3 py-1 text-[10px] font-black uppercase tracking-widest transition-all", 
                      viewMode === "before" ? "bg-on-surface/10 text-on-surface" : "text-on-surface/40 hover:bg-on-surface/5"
                    )}
                  >
                    <span className={cn("opacity-40", viewMode === "before" && "opacity-60")}>RAW</span>
                    <span className="hidden @sm:inline">原始</span>
                  </button>
                  <button 
                    type="button" 
                    onClick={() => setViewMode("after")} 
                    className={cn(
                      "flex items-center gap-1.5 rounded-[4px] px-3 py-1 text-[10px] font-black uppercase tracking-widest transition-all", 
                      viewMode === "after" ? "bg-primary/10 text-primary font-black" : "text-on-surface/40 hover:bg-on-surface/5"
                    )}
                  >
                    <span className={cn("opacity-40", viewMode === "after" && "opacity-60")}>PLAN</span>
                    <span className="hidden @sm:inline">建议</span>
                  </button>
                </div>
                
                <div className="h-4 w-px bg-on-surface/8 mx-1" />

                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <div className="relative flex min-w-0 flex-1 items-center group">
                    <Search className="absolute left-2.5 h-3.5 w-3.5 text-ui-muted pointer-events-none opacity-40 group-focus-within:text-primary transition-colors" />
                    <input 
                      value={search} 
                      onChange={(event) => setSearch(event.target.value)} 
                      placeholder="搜索节点..." 
                      className="h-8 w-full rounded-md border border-on-surface/8 bg-surface-container-lowest pl-8 pr-2.5 text-[11px] font-black text-on-surface outline-none transition-all placeholder:text-ui-muted/50 focus:border-primary/40 focus:ring-1 focus:ring-primary/10" 
                    />
                  </div>

                  <div className="relative flex shrink-0 items-center">
                    <select
                      value={filter}
                      onChange={(event) => setFilter(event.target.value as PreviewFilter)}
                      className="h-8 min-w-[90px] appearance-none rounded-md border border-on-surface/8 bg-surface-container-lowest pl-2.5 pr-8 text-[11px] font-black text-on-surface outline-none transition-all hover:bg-on-surface/[0.02] focus:border-primary/40"
                    >
                      <option value="all">全部</option>
                      <option value="changed">变更</option>
                      <option value="unresolved">待定</option>
                      <option value="review">核对</option>
                      <option value="invalidated">需确认</option>
                    </select>
                    <ChevronDown className="absolute right-2.5 h-3 w-3 text-ui-muted pointer-events-none opacity-40" />
                  </div>

                  <div className="relative hidden shrink-0 items-center @3xl:flex">
                    <select
                      value={extensionFilter}
                      onChange={(event) => setExtensionFilter(event.target.value)}
                      className="h-8 appearance-none rounded-md border border-on-surface/8 bg-surface-container-lowest pl-2.5 pr-8 text-[11px] font-black text-on-surface outline-none transition-all hover:bg-on-surface/[0.02] focus:border-primary/40"
                    >
                      {extensionOptions.map((option) => (
                        <option key={option} value={option}>{option === "all" ? "类型" : option}</option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-2.5 h-3 w-3 text-ui-muted pointer-events-none opacity-40" />
                  </div>
                </div>

                <div className="hidden shrink-0 items-center px-1 font-mono text-[10px] font-bold text-ui-muted/40 @5xl:flex">
                  {visibleCount} / {totalCount}
                </div>
              </div>
            </div>
          </div>

          <div data-testid="preview-scroll-region" className="flex-1 min-h-0 overflow-y-auto bg-surface-container-lowest/30">
            <div className="flex min-w-0 flex-col gap-4 p-4">
              {organizeMode === "incremental" && viewMode === "after" ? (
                <IncrementalMappingPanel
                  items={filteredItems}
                  selectedItemId={selectedItemId}
                  onSelectItem={setSelectedItemId}
                  onEditItem={setEditingItemId}
                  resolveTargetLabel={resolveTargetLabel}
                  readOnly={readOnly}
                />
              ) : null}
              <section className="min-w-0 min-h-[280px] @4xl:min-h-[340px] px-2 py-3">
                <div className="mb-3 shrink-0 flex items-center justify-between">
                  <div>
                    <h3 className="text-[13px] font-bold text-on-surface">{organizeMode === "incremental" && viewMode === "after" ? "结构参考" : "结构预览"}</h3>
                    <p className="text-[12px] text-ui-muted">
                      {organizeMode === "incremental" && viewMode === "after"
                        ? "映射列表负责说明归属，下面的树用于核对整体结构。"
                        : "点击编辑图标或队列条目即可确认方案。"}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      title="全部收起"
                      onClick={() => {
                        const next: Record<string, boolean> = {};
                        const traverse = (nodes: any[]) => {
                          nodes.forEach((n) => {
                            if (n.kind === "directory") {
                              next[n.path] = false;
                              traverse(n.children);
                            }
                          });
                        };
                        traverse(currentTree);
                        setExpanded(next);
                      }}
                      className="flex h-7 w-7 items-center justify-center rounded-[6px] border border-on-surface/8 bg-surface text-ui-muted hover:bg-on-surface/5 active:scale-95 transition-all"
                    >
                      <ChevronsDownUp className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      title="全部展开"
                      onClick={() => {
                        const next: Record<string, boolean> = {};
                        const traverse = (nodes: any[]) => {
                          nodes.forEach((n) => {
                            if (n.kind === "directory") {
                              next[n.path] = true;
                              traverse(n.children);
                            }
                          });
                        };
                        traverse(currentTree);
                        setExpanded(next);
                      }}
                      className="flex h-7 w-7 items-center justify-center rounded-[6px] border border-on-surface/8 bg-surface text-ui-muted hover:bg-on-surface/5 active:scale-95 transition-all"
                    >
                      <ChevronsUpDown className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                <div className="min-h-[220px] space-y-1 pr-1">
                  {currentTree.length > 0 ? currentTree.map((node) => (
                    <TreeBranch
                      key={node.path}
                      node={node}
                      depth={0}
                      expanded={expanded}
                      selectedItemId={selectedItemId}
                      onToggle={(path) => setExpanded((prev) => ({ ...prev, [path]: !(prev[path] ?? true) }))}
                      onSelectItem={setSelectedItemId}
                      onEditItem={setEditingItemId}
                      acceptedReviewItemIds={acceptedReviewItemIds}
                      viewMode={viewMode}
                      targetSlotById={targetSlotById}
                      placement={placement}
                    />
                  )) : (
                    <div className="flex h-[360px] flex-col items-center justify-center gap-3 rounded-[10px] border border-dashed border-on-surface/10 bg-on-surface/[0.02] text-center">
                      <Sparkles className="h-8 w-8 text-primary/40" />
                      <div>
                        <p className="text-[14px] font-semibold text-on-surface">
                          {viewMode === "before"
                            ? sourceTreeEntries.length > 0
                              ? "当前筛选下没有整理前条目"
                              : "当前筛选下没有条目"
                            : !hasAfterPlanData && isPlanningRun
                              ? "整理后结构尚在生成"
                              : "当前筛选下没有整理后条目"}
                        </p>
                        <p className="text-[12px] text-ui-muted">
                          {viewMode === "before"
                            ? sourceTreeEntries.length > 0
                              ? "可以切换筛选条件，或先查看完整的整理前目录树。"
                              : "扫描完成后，这里会展示真实的整理前目录结构。"
                            : !hasAfterPlanData && isPlanningRun
                              ? "先切回“前”查看原始目录，方案稳定后这里会自动出现整理后结构。"
                              : "可以切换筛选条件，或先处理下方待处理队列。"}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </section>

              <div ref={queuePanelRef}>
                <QueuePanel
                  collapsed={queueCollapsed}
                  queueCount={queueCount}
                  unresolvedCount={unresolvedItems.length}
                  reviewCount={activeReviewItems.length}
                  invalidatedCount={invalidatedItems.length}
                  onToggle={() => setQueueCollapsed((current) => !current)}
                  actions={
                    !readOnly && activeReviewItems.length > 0 ? (
                      <button
                        type="button"
                        onClick={() => {
                          void acceptAllReviewItems();
                        }}
                        className="inline-flex h-8 shrink-0 items-center gap-1 rounded-[8px] border border-primary/12 bg-primary/[0.05] px-2.5 text-[11px] font-semibold text-primary transition-colors hover:bg-primary/[0.08]"
                      >
                        {canAcceptReviewsAndRunPrecheck ? "全部留在待确认区，并开始检查" : "全部留在待确认区，稍后查看"}
                      </button>
                    ) : undefined
                  }
                >
                  <div className="space-y-3">
                    <QueueCard title="需重新确认" items={invalidatedItems} selectedItemId={editingItemId || selectedItemId} onSelectItem={(id) => { setSelectedItemId(id); setEditingItemId(id); }} onShowAll={() => setFilter("invalidated")} tone="border-error/12 bg-error-container/20" resolveTargetLabel={resolveTargetLabel} />
                    <QueueCard title="待决策" items={unresolvedItems} selectedItemId={editingItemId || selectedItemId} onSelectItem={(id) => { setSelectedItemId(id); setEditingItemId(id); }} onShowAll={() => setFilter("unresolved")} tone="border-warning/12 bg-warning-container/25" resolveTargetLabel={resolveTargetLabel} />
                    <QueueCard title="待核对" items={activeReviewItems} selectedItemId={editingItemId || selectedItemId} onSelectItem={(id) => { setSelectedItemId(id); setEditingItemId(id); }} onShowAll={() => setFilter("review")} tone="border-primary/12 bg-primary/5" resolveTargetLabel={resolveTargetLabel} />
                  </div>
                </QueuePanel>
              </div>
            </div>
          </div>
          </section>
        </div>

      <Dialog open={!!editingItemId} onOpenChange={(open) => !open && setEditingItemId(null)}>
        <DialogContent className="max-w-2xl sm:rounded-[16px] p-0 overflow-hidden border-on-surface/10 border">
          <DialogHeader className="border-b border-on-surface/6 bg-surface-container-lowest px-6 py-5">
            <div className="flex items-start justify-between pr-6">
              <div>
                <p className="text-[12px] font-bold uppercase tracking-[0.14em] text-ui-muted flex items-center gap-2">
                  <Edit2 className="w-3.5 h-3.5" />
                  独立确认
                </p>
                <DialogTitle className="mt-1 text-[18px] font-bold tracking-tight text-on-surface">
                  {editingItem?.display_name || "未知条目"}
                </DialogTitle>
              </div>
              {editingItem ? (
                <span className={cn("rounded-full border px-3 py-1.2 text-[12px] font-bold mt-1 shrink-0", itemStatusMeta(editingItem, acceptedReviewItemIds).tone)}>
                  {itemStatusMeta(editingItem, acceptedReviewItemIds).label}
                </span>
              ) : null}
            </div>
          </DialogHeader>

          {editingItem ? (
            <div className="max-h-[65vh] overflow-y-auto w-full flex flex-col bg-surface scrollbar-thin">
              
              {/* ACTION AREA - Moved to top for immediate access */}
              {!readOnly ? (
                <div className="shrink-0 border-b border-on-surface/6 bg-on-surface/[0.015] px-6 py-5">
                  <div className="space-y-4">
                    <div className="space-y-2.5">
                      <div className="text-[13px] font-bold text-on-surface flex items-center gap-2">
                        <Layers className="w-4 h-4 text-primary" /> 快速调整归属
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {availableTargetOptions.slice(0, 12).map((option) => (
                          <button
                            key={`${editingItem.item_id}-${option.key}`}
                            type="button"
                            onClick={() => {
                              void applyItemTarget(
                                editingItem.item_id,
                                option.directory === "Review"
                                  ? { move_to_review: true }
                                  : option.targetSlotId
                                    ? { target_slot: option.targetSlotId }
                                    : { target_dir: option.directory },
                              );
                              setEditingItemId(null);
                            }}
                            className={cn(
                              "rounded-[6px] border px-3 py-1.5 text-[11.5px] font-semibold transition-all active:scale-95",
                              (
                                (option.targetSlotId && editingItem.target_slot_id === option.targetSlotId) ||
                                (!option.targetSlotId && resolveTargetLabel(editingItem) === option.directory)
                              )
                                ? "border-primary/30 bg-primary/10 text-primary"
                                : "border-on-surface/10 bg-surface text-on-surface hover:border-primary/20 hover:bg-surface-container",
                            )}
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-2 pt-2 border-t border-on-surface/6">
                      <button type="button" onClick={() => setShowManualInput((current) => !current)} className="text-[11.5px] font-bold text-primary flex items-center gap-1 opacity-80 hover:opacity-100 transition-opacity">
                        {showManualInput ? "- 收起手动路径输入" : "+ 手动指定其他路径"}
                      </button>
                      {showManualInput ? (
                        <div className="relative">
                          <div className="flex gap-2 min-w-0 items-center">
                            <div className="relative flex-1">
                              <input
                                value={manualTarget}
                                onChange={(event) => setManualTarget(event.target.value)}
                                placeholder="如: 新专题/归档"
                                className="h-9 w-full rounded-[6px] border border-on-surface/15 bg-surface px-3 text-[12px] font-medium text-on-surface outline-none focus:border-primary/50"
                              />
                              {/* 目标路径建议 */}
                              {manualTargetTrimmed && !manualTargetInvalid && availableDirectories.filter(d => d.toLowerCase().includes(manualTargetTrimmed.toLowerCase()) && d !== manualTargetTrimmed && d !== "Review").length > 0 && (
                                <div className="absolute top-full left-0 right-0 z-50 mt-1 max-h-48 overflow-y-auto rounded-[8px] border border-on-surface/10 bg-surface py-1 scrollbar-thin animate-in fade-in slide-in-from-top-2">
                                  <div className="px-3 py-1.5 text-[10px] font-bold text-ui-muted uppercase tracking-wider bg-on-surface/[0.02]">建议目标目录</div>
                                  {availableDirectories
                                    .filter(d => d.toLowerCase().includes(manualTargetTrimmed.toLowerCase()) && d !== manualTargetTrimmed && d !== "Review")
                                    .slice(0, 8)
                                    .map((dir) => (
                                      <button
                                        key={`suggest-${dir}`}
                                        type="button"
                                        onClick={() => setManualTarget(dir)}
                                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-[12px] text-on-surface hover:bg-primary/5 hover:text-primary transition-colors"
                                      >
                                        <Folder className="w-3.5 h-3.5 opacity-40" />
                                        <span className="truncate">{dir}</span>
                                      </button>
                                    ))}
                                </div>
                              )}
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                if (manualTargetInvalid || !manualTargetTrimmed) {
                                  return;
                                }
                                void applyItemTarget(editingItem.item_id, { target_dir: manualTargetTrimmed });
                                setEditingItemId(null);
                              }}
                              disabled={manualTargetInvalid || !manualTargetTrimmed}
                              className="shrink-0 h-9 rounded-[6px] bg-on-surface px-4 text-[12px] font-bold text-surface transition-transform active:scale-95 hover:bg-on-surface/90 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              应用此路径
                            </button>
                          </div>
                          <p className="mt-1.5 text-[10.5px] text-ui-muted px-0.5">填写的是相对“新目录生成位置”的路径（不支持绝对路径或 Review/...）。Review 是待确认区。</p>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              ) : null}

              {/* READONLY DETAILS AREA - Flattened no-card layout */}
              <div className="p-6">
                <div className="grid gap-x-12 gap-y-8 sm:grid-cols-2">
                  
                  {/* Left Column: Source Info */}
                  <div className="space-y-4">
                    <div>
                      <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-ui-muted opacity-80 mb-1.5 flex items-center gap-1.5">
                        <FolderOpen className="w-3.5 h-3.5" /> 原始条目
                      </div>
                      <div className="break-all text-[13px] font-bold text-on-surface leading-snug">{editingItem.display_name}</div>
                      {itemMetaLabel(editingItem) ? (
                        <div className="mt-2 inline-block rounded border border-on-surface/8 bg-on-surface/[0.03] px-2 py-0.5 text-[10px] font-bold text-ui-muted">
                          {itemMetaLabel(editingItem)}
                        </div>
                      ) : null}
                    </div>
                    <div>
                      <div className="text-[10px] font-bold tracking-[0.08em] uppercase text-ui-muted opacity-60 mb-1">来源路径</div>
                      <div className="break-all font-mono text-[11px] text-on-surface-variant leading-relaxed">{editingItem.source_relpath}</div>
                    </div>
                  </div>

                  {/* Right Column: Target Info */}
                  <div className="space-y-4">
                    <div>
                      <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-primary/80 mb-1.5 flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5" /> 预期归属
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="break-all text-[14px] font-bold text-primary">{editingTargetMeta?.directoryLabel}</div>
                        {editingTargetMeta?.slotLabel ? (
                          <span className="shrink-0 rounded-full border border-primary/15 bg-primary/10 px-2.5 py-0.5 text-[10px] font-bold text-primary">
                            {editingTargetMeta.slotLabel}
                          </span>
                        ) : null}
                        <span className="shrink-0 rounded-full border border-on-surface/10 bg-surface px-2 py-0.5 text-[10px] font-bold text-ui-muted">
                          {editingTargetMeta?.mappingLabel}
                        </span>
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] font-bold tracking-[0.08em] uppercase text-ui-muted opacity-60 mb-1">完整目标路径</div>
                      <div className="break-all font-mono text-[11px] text-on-surface-variant leading-relaxed">{editingTargetMeta?.fullTargetPath}</div>
                    </div>
                  </div>
                </div>

                <div className="mt-8 border-t border-on-surface/6 pt-8 grid gap-x-12 gap-y-8 sm:grid-cols-2">
                  {/* Left Column: Reason */}
                  <div>
                    <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-ui-muted opacity-80 mb-3 flex items-center gap-1.5">
                      <Info className="w-3.5 h-3.5" /> 归类原因
                    </div>
                    <div className="text-[12.5px] leading-[1.6] text-on-surface/90 text-justify [&>div>p]:mb-2 [&>div>p:last-child]:mb-0">
                      {editingItem.reason || editingItem.suggested_purpose ? (
                        <MarkdownProse content={editingItem.reason || editingItem.suggested_purpose!} />
                      ) : (
                        <span className="opacity-50 italic">未提供说明</span>
                      )}
                    </div>
                  </div>

                  {/* Right Column: Content Summary */}
                  <div>
                    <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-ui-muted opacity-80 mb-3 flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <FileText className="w-3.5 h-3.5" /> 内容摘要
                      </div>
                      <div className="text-[10px] font-mono tracking-normal opacity-80">
                        置信度: {typeof editingItem.confidence === "number" ? `${Math.round(editingItem.confidence * 100)}%` : "N/A"}
                      </div>
                    </div>
                    <div className="text-[12.5px] leading-[1.6] text-on-surface/90 text-justify [&>div>p]:mb-2 [&>div>p:last-child]:mb-0">
                      {editingItem.content_summary ? (
                        <MarkdownProse content={editingItem.content_summary} />
                      ) : (
                        <span className="opacity-50 italic">暂无内容摘要</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      {!readOnly ? (
        <div data-testid="preview-footer" className="sticky bottom-0 z-10 shrink-0 border-t border-on-surface/8 bg-surface-container-low px-6 py-4">
          {pendingQueueCount > 0 ? (
            <button
              type="button"
              onClick={focusQueue}
              className="mb-2 flex w-full items-center justify-between gap-3 rounded-[8px] px-2 py-1.5 text-left text-[13px] text-on-surface transition-colors hover:bg-warning/8"
            >
              <div className="flex min-w-0 items-center gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0 text-warning" />
                <span className="truncate">{precheckNotice}</span>
              </div>
              <span className="shrink-0 text-[12px] font-bold text-primary">点击查看</span>
            </button>
          ) : (
            <div className="mb-3 flex items-center gap-2 text-[13px] text-on-surface">
              {canRunPrecheck ? <CheckCircle2 className="h-4 w-4 text-success-dim" /> : <AlertTriangle className="h-4 w-4 text-warning" />}
              <span>{precheckNotice}</span>
            </div>
          )}
          <button type="button" onClick={onRunPrecheck} disabled={isBusy || !canRunPrecheck} className={cn("flex w-full items-center justify-center gap-2 rounded-md py-3 text-[14px] font-black uppercase tracking-widest transition-all active:scale-[0.98]", canRunPrecheck && !isBusy ? "bg-primary text-white" : "cursor-not-allowed border border-on-surface/8 bg-on-surface/[0.05] text-ui-muted")}>
            <Layers className="h-4 w-4" />
            {isBusy ? "正在更新方案" : canRunPrecheck ? "检查移动风险" : pendingQueueCount > 0 ? "先处理待处理项" : isPlanSyncing ? "等待方案更新完成" : "等待方案准备好"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
