"use client";

import React, { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, FileText, Folder, FolderOpen, Layers, Search, ShieldAlert, Sparkles, Edit2, Info, ChevronsDownUp, ChevronsUpDown } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { MarkdownProse } from "./markdown-prose";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogClose } from "@/components/ui/dialog";

import { cn } from "@/lib/utils";
import type { PlanItem, PlanSnapshot, SessionStage } from "@/types/session";

export type PreviewFilter = "all" | "changed" | "unresolved" | "review" | "invalidated";

export interface PreviewFocusRequest {
  token: number;
  itemIds: string[];
  filter?: PreviewFilter;
}

interface PreviewPanelProps {
  plan: PlanSnapshot;
  stage: SessionStage;
  isBusy: boolean;
  isPlanSyncing?: boolean;
  plannerStatus?: {
    preservingPreviousPlan: boolean;
    isRunning: boolean;
  } | null;
  readOnly?: boolean;
  onRunPrecheck: () => void;
  onUpdateItem: (itemId: string, payload: { target_dir?: string; move_to_review?: boolean }) => Promise<void> | void;
  precheckSummary?: { mkdir_preview?: string[] } | null;
  focusRequest?: PreviewFocusRequest | null;
}

interface TreeNode {
  name: string;
  path: string;
  kind: "directory" | "file";
  item?: PlanItem;
  children: TreeNode[];
}

function normalizePath(path: string | null | undefined): string {
  return String(path || "").replace(/\\/g, "/").replace(/^\/+|\/+$/g, "").trim();
}

function targetDir(item: Pick<PlanItem, "target_relpath">): string {
  const value = normalizePath(item.target_relpath);
  return value.includes("/") ? value.slice(0, value.lastIndexOf("/")) : "";
}

function fileExtension(item: Pick<PlanItem, "display_name" | "source_relpath">): string {
  const source = item.display_name || item.source_relpath;
  const ext = source.split(".").pop()?.toLowerCase();
  return ext && ext !== source.toLowerCase() ? ext : "无后缀";
}

function statusMeta(status: PlanItem["status"]) {
  if (status === "unresolved") return { label: "待决策", tone: "border-warning/20 bg-warning/10 text-warning" };
  if (status === "review") return { label: "待核对", tone: "border-primary/20 bg-primary/10 text-primary" };
  if (status === "invalidated") return { label: "需重新确认", tone: "border-error/20 bg-error-container/35 text-error" };
  return { label: "已规划", tone: "border-success/20 bg-success/10 text-success-dim" };
}

function matchesFilter(item: PlanItem, filter: PreviewFilter) {
  if (filter === "all") return true;
  if (filter === "changed") return normalizePath(item.source_relpath) !== normalizePath(item.target_relpath);
  if (filter === "unresolved") return item.status === "unresolved";
  if (filter === "review") return item.status === "review";
  return item.status === "invalidated";
}

function buildTree(items: PlanItem[], mode: "before" | "after", mkdirPreview: string[]): TreeNode[] {
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
    const rawPath = mode === "before" ? item.source_relpath : item.target_relpath || item.source_relpath;
    const parts = normalizePath(rawPath).split("/").filter(Boolean);
    const filename = parts.pop();
    if (!filename) return;
    const parent = ensureDir(parts);
    parent.children.push({ name: filename, path: normalizePath(rawPath), kind: "file", item, children: [] });
  });
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

function TreeBranch({
  node,
  depth,
  expanded,
  selectedItemId,
  onToggle,
  onSelectItem,
  onEditItem,
}: {
  node: TreeNode;
  depth: number;
  expanded: Record<string, boolean>;
  selectedItemId: string | null;
  onToggle: (path: string) => void;
  onSelectItem: (itemId: string) => void;
  onEditItem: (itemId: string) => void;
}) {
  if (node.kind === "file" && node.item) {
    const status = statusMeta(node.item.status);
    return (
      <button
        type="button"
        onClick={() => onSelectItem(node.item!.item_id)}
        className={cn(
          "group flex w-full items-center gap-3 rounded-[8px] border py-2 pr-3 text-left transition-colors",
          selectedItemId === node.item.item_id ? "border-primary/22 bg-primary/6" : "border-transparent hover:border-on-surface/8 hover:bg-on-surface/[0.02]",
        )}
        style={{ paddingLeft: 12 + depth * 16 }}
      >
        <FileText className="h-4 w-4 shrink-0 text-on-surface-variant/60" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold text-on-surface">{node.item.display_name}</p>
          <p className="truncate text-[11px] text-ui-muted">{node.item.suggested_purpose || "未提供归类理由"}</p>
        </div>
        <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-bold shrink-0", status.tone)}>{status.label}</span>
        <div
          role="button"
          onClick={(e) => {
            e.stopPropagation();
            onEditItem(node.item!.item_id);
          }}
          className={cn(
            "flex h-7 w-7 shrink-0 items-center justify-center rounded-[6px] border border-on-surface/10 bg-surface shadow-sm transition-opacity hover:bg-on-surface/[0.02] active:scale-95",
            selectedItemId === node.item.item_id ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus:opacity-100"
          )}
        >
          <Edit2 className="h-3.5 w-3.5 text-on-surface-variant" />
        </div>
      </button>
    );
  }

  const isExpanded = expanded[node.path] ?? depth < 1;
  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={() => onToggle(node.path)}
        className="flex w-full items-center gap-2 rounded-[8px] py-2 pr-2 text-left transition-colors hover:bg-on-surface/[0.02]"
        style={{ paddingLeft: 8 + depth * 16 }}
      >
        {isExpanded ? <FolderOpen className="h-4 w-4 shrink-0 text-primary" /> : <Folder className="h-4 w-4 shrink-0 text-primary" />}
        <span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-on-surface">{node.name}</span>
        <span className="text-[11px] text-ui-muted">{node.children.length}</span>
      </button>
      <AnimatePresence initial={false}>
        {isExpanded ? (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="space-y-1 overflow-hidden">
            {node.children.map((child) => (
              <TreeBranch key={child.path} node={child} depth={depth + 1} expanded={expanded} selectedItemId={selectedItemId} onToggle={onToggle} onSelectItem={onSelectItem} onEditItem={onEditItem} />
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
}: {
  title: string;
  items: PlanItem[];
  selectedItemId: string | null;
  onSelectItem: (itemId: string) => void;
  onShowAll: () => void;
  tone: string;
}) {
  if (items.length === 0) return null;
  return (
    <section className={cn("rounded-[10px] border p-3", tone)}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-[13px] font-bold text-on-surface">{title}</h3>
            <span className="rounded-full bg-white/70 px-2 py-0.5 text-[10px] font-bold text-on-surface/70">{items.length}</span>
          </div>
          <p className="text-[12px] text-ui-muted">点击条目后，右侧会显示更详细的检查信息。</p>
        </div>
        <button type="button" onClick={onShowAll} className="rounded-[6px] border border-on-surface/8 bg-surface px-2.5 py-1 text-[11px] font-semibold text-on-surface">
          查看
        </button>
      </div>
      <div className="mt-3 space-y-1.5">
        {items.slice(0, 4).map((item) => (
          <button
            key={item.item_id}
            type="button"
            onClick={() => onSelectItem(item.item_id)}
            className={cn(
              "flex w-full items-center justify-between gap-3 rounded-[8px] border px-3 py-2 text-left transition-colors",
              selectedItemId === item.item_id ? "border-primary/18 bg-surface" : "border-transparent bg-surface/60 hover:border-on-surface/8 hover:bg-surface",
            )}
          >
            <div className="min-w-0">
              <p className="truncate text-[12px] font-semibold text-on-surface">{item.display_name}</p>
              <p className="truncate text-[11px] text-ui-muted">{targetDir(item) || "当前目录"}</p>
            </div>
            <span className="text-[11px] text-ui-muted">{fileExtension(item)}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

export function PreviewPanel(props: PreviewPanelProps) {
  const { plan, stage, isBusy, isPlanSyncing = false, plannerStatus = null, readOnly = false, onRunPrecheck, onUpdateItem, precheckSummary, focusRequest } = props;
  const allItems = useMemo(() => {
    const merged = new Map<string, PlanItem>();
    [...(plan.items || []), ...(plan.invalidated_items || [])].forEach((item) => {
      if (item?.item_id) {
        merged.set(item.item_id, item);
      }
    });
    return Array.from(merged.values());
  }, [plan.invalidated_items, plan.items]);
  const [viewMode, setViewMode] = useState<"before" | "after">("after");
  const [filter, setFilter] = useState<PreviewFilter>("all");
  const [search, setSearch] = useState("");
  const [extensionFilter, setExtensionFilter] = useState("all");
  const [selectedItemId, setSelectedItemId] = useState<string | null>(allItems[0]?.item_id || null);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const editingItem = useMemo(() => allItems.find((item) => item.item_id === editingItemId) || null, [allItems, editingItemId]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [manualTarget, setManualTarget] = useState("");
  const [showManualInput, setShowManualInput] = useState(false);

  const unresolvedItems = useMemo(() => allItems.filter((item) => item.status === "unresolved"), [allItems]);
  const reviewItems = useMemo(() => allItems.filter((item) => item.status === "review"), [allItems]);
  const invalidatedItems = useMemo(() => (plan.invalidated_items || []).map((item) => ({ ...item, status: "invalidated" as const })), [plan.invalidated_items]);

  const extensionOptions = useMemo(() => ["all", ...Array.from(new Set(allItems.map((item) => fileExtension(item)))).sort((a, b) => a.localeCompare(b, "zh-CN"))], [allItems]);
  const filteredItems = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return allItems.filter((item) => {
      if (!matchesFilter(item, filter)) return false;
      if (extensionFilter !== "all" && fileExtension(item) !== extensionFilter) return false;
      if (!keyword) return true;
      return [item.display_name, item.source_relpath, item.target_relpath || "", item.suggested_purpose || "", item.content_summary || ""]
        .some((value) => value.toLowerCase().includes(keyword));
    });
  }, [allItems, extensionFilter, filter, search]);
  const selectedItem = useMemo(() => allItems.find((item) => item.item_id === selectedItemId) || null, [allItems, selectedItemId]);
  const mkdirPreview = precheckSummary?.mkdir_preview || [];
  const currentTree = useMemo(() => buildTree(filteredItems, viewMode, mkdirPreview), [filteredItems, mkdirPreview, viewMode]);
  const availableDirectories = useMemo(() => {
    const dirs = new Set<string>(["Review"]);
    plan.groups.forEach((group) => group.directory && dirs.add(group.directory));
    allItems.forEach((item) => {
      const dir = targetDir(item);
      if (dir) dirs.add(dir);
    });
    return Array.from(dirs).sort((a, b) => a.localeCompare(b, "zh-CN"));
  }, [allItems, plan.groups]);
  const canRunPrecheck = stage === "ready_for_precheck" && plan.readiness.can_precheck && !isPlanSyncing;

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
    setManualTarget(targetDir(editingItem || { target_relpath: "" }));
  }, [editingItem]);

  const applyItemTarget = async (itemId: string, payload: { target_dir?: string; move_to_review?: boolean }) => {
    await Promise.resolve(onUpdateItem(itemId, payload));
  };

  const applyBatch = async (items: PlanItem[], payload: { target_dir?: string; move_to_review?: boolean }) => {
    for (const item of items) {
      await applyItemTarget(item.item_id, payload);
    }
  };

  const currentExt = editingItem ? fileExtension(editingItem) : null;
  const extMatchedItems = currentExt ? allItems.filter((item) => fileExtension(item) === currentExt) : [];
  const sameSuggestedDirItems = editingItem ? unresolvedItems.filter((item) => targetDir(item) === targetDir(editingItem) && targetDir(item)) : [];
  const blockingQueueCount = invalidatedItems.length + unresolvedItems.length;
  const precheckNotice = canRunPrecheck
    ? "待处理队列已经清空，可以开始预检。"
    : invalidatedItems.length > 0
      ? `仍有 ${invalidatedItems.length} 项需重新确认。`
      : unresolvedItems.length > 0
        ? `仍有 ${unresolvedItems.length} 项待决策。`
        : "方案正在同步，稍后即可预检。";

  return (
    <div className="flex h-full w-full min-w-0 flex-col bg-transparent @container overflow-hidden">
        <div className="mx-auto flex h-full w-full max-w-[1440px] flex-col min-w-0 px-4 py-4 lg:px-6 overflow-hidden">
          <section className="min-w-0 flex flex-col h-full rounded-[12px] border border-on-surface/8 bg-surface-container-lowest shadow-[0_20px_40px_rgba(0,0,0,0.04)] overflow-hidden">
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
            <div className="border-b border-on-surface/6 px-4 py-3 @lg:px-5">
              <div className="flex flex-col gap-2 @3xl:flex-row @3xl:items-center @3xl:justify-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-3">
                    <div className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.12em] text-primary/70">
                      <Layers className="h-3.5 w-3.5" />
                      方案预览
                    </div>
                    <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold", blockingQueueCount > 0 || !canRunPrecheck ? "bg-warning/10 text-warning" : "bg-success/10 text-success-dim ml-auto")}>
                      {blockingQueueCount > 0 ? `待处理 ${blockingQueueCount}` : canRunPrecheck ? "可预检" : "同步中"}
                    </span>
                  </div>
                  <h2 className="mt-1 text-[15px] font-bold tracking-tight text-on-surface truncate">先看待处理，再核对目标结构</h2>
                </div>
                
                <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-0.5">
                  <div className="flex shrink-0 items-center gap-1.5 rounded-full border border-on-surface/8 bg-surface px-2.5 py-1 text-[11px] font-semibold text-on-surface">
                    <Sparkles className="h-3 w-3 text-primary/60" />
                    <span>移动 {plan.stats.move_count}</span>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5 rounded-full border border-on-surface/8 bg-surface px-2.5 py-1 text-[11px] font-semibold text-on-surface">
                    <Folder className="h-3 w-3 text-primary/60" />
                    <span>新目录 {plan.stats.directory_count}</span>
                  </div>
                </div>
              </div>
              
              {plan.summary && (
                <div className="mt-2 line-clamp-2 text-[12px] leading-relaxed text-ui-muted opacity-70 hover:opacity-100 hover:line-clamp-none transition-all cursor-default overflow-hidden">
                  <MarkdownProse content={plan.summary} />
                </div>
              )}
            </div>

            <div className="border-b border-on-surface/6 bg-on-surface/[0.01] px-4 py-2 @lg:px-5">
              <div className="flex flex-wrap items-center gap-2 min-w-0">
                <div className="flex shrink-0 items-center rounded-lg border border-on-surface/8 bg-surface p-0.5 shadow-sm">
                  <button type="button" onClick={() => setViewMode("before")} className={cn("rounded-md px-2.5 py-1 text-[11px] font-bold transition-all", viewMode === "before" ? "bg-on-surface text-surface shadow-sm" : "text-on-surface-variant hover:bg-on-surface/5")}>前</button>
                  <button type="button" onClick={() => setViewMode("after")} className={cn("rounded-md px-2.5 py-1 text-[11px] font-bold transition-all", viewMode === "after" ? "bg-primary text-white shadow-sm" : "text-on-surface-variant hover:bg-on-surface/5")}>后</button>
                </div>
                
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <select value={filter} onChange={(event) => setFilter(event.target.value as PreviewFilter)} className="h-8 min-w-0 rounded-lg border border-on-surface/8 bg-surface px-2 text-[11px] font-bold text-on-surface outline-none focus:border-primary/40 focus:ring-1 focus:ring-primary/20">
                    <option value="all">全部条目</option>
                    <option value="changed">只看变更</option>
                    <option value="unresolved">只看待决策</option>
                    <option value="review">只看待核对</option>
                    <option value="invalidated">只看重新确认</option>
                  </select>
                  
                  <div className="relative flex min-w-0 flex-1 items-center">
                    <Search className="absolute left-2.5 h-3.5 w-3.5 text-ui-muted pointer-events-none" />
                    <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索文件名..." className="h-8 w-full rounded-lg border border-on-surface/8 bg-surface pl-8 pr-2 text-[11px] text-on-surface outline-none placeholder:text-ui-muted focus:border-primary/40 focus:ring-1 focus:ring-primary/20" />
                  </div>

                  <select value={extensionFilter} onChange={(event) => setExtensionFilter(event.target.value)} className="hidden h-8 rounded-lg border border-on-surface/8 bg-surface px-2 text-[11px] font-bold text-on-surface outline-none @3xl:block">
                    {extensionOptions.map((option) => <option key={option} value={option}>{option === "all" ? "全部类型" : option}</option>)}
                  </select>
                </div>

                <div className="hidden shrink-0 items-center px-1 text-[10px] font-bold text-ui-muted/60 @5xl:flex">
                  {filteredItems.length} / {allItems.length}
                </div>
              </div>
            </div>
          </div>

          <div className="flex-1 flex flex-col gap-4 p-4 min-w-0 min-h-0 @4xl:flex-row overflow-hidden">
              <section className="flex-1 min-w-0 flex flex-col rounded-[10px] border border-on-surface/8 bg-surface p-3 overflow-hidden">
                <div className="mb-3 shrink-0 flex items-center justify-between">
                  <div>
                    <h3 className="text-[13px] font-bold text-on-surface">结构预览</h3>
                    <p className="text-[12px] text-ui-muted">点击编辑图标或队列条目即可确认方案。</p>
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
                <div className="flex-1 overflow-y-auto space-y-1 scrollbar-thin pr-3">
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
                    />
                  )) : (
                    <div className="flex h-[360px] flex-col items-center justify-center gap-3 rounded-[10px] border border-dashed border-on-surface/10 bg-on-surface/[0.02] text-center">
                      <Sparkles className="h-8 w-8 text-primary/40" />
                      <div>
                        <p className="text-[14px] font-semibold text-on-surface">当前筛选下没有条目</p>
                        <p className="text-[12px] text-ui-muted">可以切换筛选条件，或先处理右侧待处理队列。</p>
                      </div>
                    </div>
                  )}
                </div>
              </section>

              <aside className="w-full shrink-0 flex flex-col space-y-3 min-w-0 @4xl:w-[320px] @4xl:flex-none overflow-y-auto scrollbar-thin pr-3">
                <QueueCard title="需重新确认" items={invalidatedItems} selectedItemId={editingItemId || selectedItemId} onSelectItem={(id) => { setSelectedItemId(id); setEditingItemId(id); }} onShowAll={() => setFilter("invalidated")} tone="border-error/12 bg-error-container/20" />
                <QueueCard title="待决策" items={unresolvedItems} selectedItemId={editingItemId || selectedItemId} onSelectItem={(id) => { setSelectedItemId(id); setEditingItemId(id); }} onShowAll={() => setFilter("unresolved")} tone="border-warning/12 bg-warning-container/25" />
                <QueueCard title="待核对" items={reviewItems} selectedItemId={editingItemId || selectedItemId} onSelectItem={(id) => { setSelectedItemId(id); setEditingItemId(id); }} onShowAll={() => setFilter("review")} tone="border-primary/12 bg-primary/5" />
              </aside>
            </div>
          </section>
        </div>

      <Dialog open={!!editingItemId} onOpenChange={(open) => !open && setEditingItemId(null)}>
        <DialogContent className="max-w-2xl sm:rounded-[16px] p-0 overflow-hidden border-on-surface/10 shadow-[0_32px_80px_rgba(0,0,0,0.12)]">
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
                <span className={cn("rounded-full border px-3 py-1.2 text-[12px] font-bold mt-1 shrink-0", statusMeta(editingItem.status).tone)}>
                  {statusMeta(editingItem.status).label}
                </span>
              ) : null}
            </div>
          </DialogHeader>

          {editingItem ? (
            <div className="max-h-[65vh] overflow-y-auto w-full p-6 space-y-6 bg-surface scrollbar-thin">
              <div className="grid gap-3">
                <div className="min-w-0 flex-1 rounded-[10px] border border-on-surface/8 bg-surface-container-lowest px-4 py-3 shadow-sm">
                  <div className="text-[11px] font-bold tracking-wider text-ui-muted flex items-center gap-1.5"><FolderOpen className="w-3.5 h-3.5" /> 原路径</div>
                  <div className="mt-1 break-all text-[13px] font-medium text-on-surface">{editingItem.source_relpath}</div>
                </div>
                <div className="min-w-0 flex-1 rounded-[10px] border border-on-surface/8 bg-surface-container-lowest px-4 py-3 shadow-sm relative overflow-hidden">
                  <div className="absolute -top-4 -right-2 p-4 opacity-[0.03] pointer-events-none"><Folder className="w-24 h-24" /></div>
                  <div className="text-[11px] font-bold tracking-wider text-ui-muted flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-success-dim" /> 目标路径</div>
                  <div className="mt-1 break-all text-[14px] font-bold text-primary">{editingItem.target_relpath || "当前目录"}</div>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="min-w-0 flex-1 rounded-[10px] border border-on-surface/8 bg-surface-container-lowest px-4 py-3 shadow-sm">
                  <div className="text-[11px] font-bold tracking-wider text-ui-muted flex items-center gap-1.5"><Info className="w-3.5 h-3.5" /> 归类理由</div>
                  <div className="mt-2 text-[13px] leading-relaxed text-on-surface [&>div>p]:mb-1 [&>div>p:last-child]:mb-0">
                    {editingItem.reason || editingItem.suggested_purpose ? (
                      <MarkdownProse content={editingItem.reason || editingItem.suggested_purpose!} />
                    ) : (
                      "当前没有额外理由说明。"
                    )}
                  </div>
                </div>
                <div className="min-w-0 flex-1 rounded-[10px] border border-on-surface/8 bg-surface-container-lowest px-4 py-3 shadow-sm">
                  <div className="text-[11px] font-bold tracking-wider text-ui-muted flex items-center gap-1.5"><FileText className="w-3.5 h-3.5" /> 摘要 / 置信度</div>
                  <div className="mt-2 text-[13px] leading-relaxed text-on-surface [&>div>p]:mb-1 [&>div>p:last-child]:mb-0">
                    {editingItem.content_summary ? (
                      <MarkdownProse content={editingItem.content_summary} />
                    ) : (
                      "当前没有摘要。"
                    )}
                    <span className="block mt-2 text-[11px] font-semibold text-primary/70 bg-primary/5 inline-block px-2.5 py-0.5 rounded-full inline-flex border border-primary/10">
                      置信度: {typeof editingItem.confidence === "number" ? `${Math.round(editingItem.confidence * 100)}%` : "未知"}
                    </span>
                  </div>
                </div>
              </div>

              {!readOnly ? (
                <div className="space-y-4 pt-1">
                  <div className="space-y-2.5">
                    <div className="text-[13px] font-bold text-on-surface flex items-center gap-2">
                      <Layers className="w-4 h-4 text-primary" /> 快速调整目标
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {availableDirectories.slice(0, 12).map((directory) => (
                        <button
                          key={`${editingItem.item_id}-${directory}`}
                          type="button"
                          onClick={() => {
                            void applyItemTarget(editingItem.item_id, directory === "Review" ? { move_to_review: true } : { target_dir: directory });
                            setEditingItemId(null);
                          }}
                          className={cn(
                            "rounded-[8px] border px-4 py-2 text-[12px] font-semibold transition-all active:scale-95",
                            targetDir(editingItem) === directory ? "border-primary/30 bg-primary/10 text-primary shadow-sm" : "border-on-surface/10 bg-surface text-on-surface hover:border-primary/20 hover:bg-surface-container",
                          )}
                        >
                          {directory}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2 pt-2">
                    <button type="button" onClick={() => setShowManualInput((current) => !current)} className="text-[12px] font-bold text-primary flex items-center gap-1 opacity-80 hover:opacity-100 transition-opacity">
                      {showManualInput ? "- 收起手动路径输入" : "+ 手动输入特殊路径"}
                    </button>
                    {showManualInput ? (
                      <div className="flex gap-2 min-w-0 items-center">
                        <input value={manualTarget} onChange={(event) => setManualTarget(event.target.value)} placeholder="如: 项目/归档" className="h-10 min-w-0 flex-1 rounded-[8px] border border-on-surface/15 bg-surface px-3 text-[13px] font-medium text-on-surface outline-none focus:border-primary/50" />
                        <button type="button" onClick={() => { void applyItemTarget(editingItem.item_id, { target_dir: manualTarget.trim() }); setEditingItemId(null); }} className="shrink-0 h-10 rounded-[8px] bg-on-surface px-5 text-[13px] font-bold text-surface transition-transform active:scale-95 hover:bg-on-surface/90">
                          应用
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      {!readOnly ? (
        <div className="shrink-0 border-t border-on-surface/8 bg-surface-container-low px-4 py-3 lg:px-6">
          <div className="mb-2 flex items-center gap-2 text-[13px] text-on-surface">
            {canRunPrecheck ? <CheckCircle2 className="h-4 w-4 text-success-dim" /> : <AlertTriangle className="h-4 w-4 text-warning" />}
            <span>{precheckNotice}</span>
          </div>
          <button type="button" onClick={onRunPrecheck} disabled={isBusy || !canRunPrecheck} className={cn("flex w-full items-center justify-center gap-2 rounded-[10px] py-3 text-[14px] font-semibold transition-colors", canRunPrecheck && !isBusy ? "bg-primary text-white" : "cursor-not-allowed border border-on-surface/8 bg-on-surface/[0.05] text-ui-muted")}>
            <Layers className="h-4 w-4" />
            {isBusy ? "正在更新方案" : canRunPrecheck ? "开始预检" : blockingQueueCount > 0 ? "先处理待处理队列" : "等待方案同步完成"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
