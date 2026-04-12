"use client";

import React, { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, FileText, Folder, FolderOpen, Layers, Search, ShieldAlert, Sparkles } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { MarkdownProse } from "./markdown-prose";

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
}: {
  node: TreeNode;
  depth: number;
  expanded: Record<string, boolean>;
  selectedItemId: string | null;
  onToggle: (path: string) => void;
  onSelectItem: (itemId: string) => void;
}) {
  if (node.kind === "file" && node.item) {
    const status = statusMeta(node.item.status);
    return (
      <button
        type="button"
        onClick={() => onSelectItem(node.item!.item_id)}
        className={cn(
          "flex w-full items-center gap-3 rounded-[8px] border px-3 py-2 text-left transition-colors",
          selectedItemId === node.item.item_id ? "border-primary/22 bg-primary/6" : "border-transparent hover:border-on-surface/8 hover:bg-on-surface/[0.02]",
        )}
        style={{ marginLeft: depth * 16 }}
      >
        <FileText className="h-4 w-4 shrink-0 text-on-surface-variant/60" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold text-on-surface">{node.item.display_name}</p>
          <p className="truncate text-[11px] text-ui-muted">{node.item.suggested_purpose || "未提供归类理由"}</p>
        </div>
        <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-bold", status.tone)}>{status.label}</span>
      </button>
    );
  }

  const isExpanded = expanded[node.path] ?? depth < 1;
  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={() => onToggle(node.path)}
        className="flex w-full items-center gap-2 rounded-[8px] px-2 py-2 text-left transition-colors hover:bg-on-surface/[0.02]"
        style={{ marginLeft: depth * 16 }}
      >
        {isExpanded ? <FolderOpen className="h-4 w-4 shrink-0 text-primary" /> : <Folder className="h-4 w-4 shrink-0 text-primary" />}
        <span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-on-surface">{node.name}</span>
        <span className="text-[11px] text-ui-muted">{node.children.length}</span>
      </button>
      <AnimatePresence initial={false}>
        {isExpanded ? (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="space-y-1 overflow-hidden">
            {node.children.map((child) => (
              <TreeBranch key={child.path} node={child} depth={depth + 1} expanded={expanded} selectedItemId={selectedItemId} onToggle={onToggle} onSelectItem={onSelectItem} />
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
  const { plan, isBusy, readOnly = false, onRunPrecheck, onUpdateItem, precheckSummary, focusRequest } = props;
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
  const canRunPrecheck = plan.readiness.can_precheck;

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
    setManualTarget(targetDir(selectedItem || { target_relpath: "" }));
  }, [selectedItem]);

  const applyItemTarget = async (itemId: string, payload: { target_dir?: string; move_to_review?: boolean }) => {
    await Promise.resolve(onUpdateItem(itemId, payload));
  };

  const applyBatch = async (items: PlanItem[], payload: { target_dir?: string; move_to_review?: boolean }) => {
    for (const item of items) {
      await applyItemTarget(item.item_id, payload);
    }
  };

  const currentExt = selectedItem ? fileExtension(selectedItem) : null;
  const extMatchedItems = currentExt ? allItems.filter((item) => fileExtension(item) === currentExt) : [];
  const sameSuggestedDirItems = selectedItem ? unresolvedItems.filter((item) => targetDir(item) === targetDir(selectedItem) && targetDir(item)) : [];
  const blockingQueueCount = invalidatedItems.length + unresolvedItems.length;
  const precheckNotice = canRunPrecheck
    ? "待处理队列已经清空，可以开始预检。"
    : invalidatedItems.length > 0
      ? `仍有 ${invalidatedItems.length} 项需重新确认。`
      : unresolvedItems.length > 0
        ? `仍有 ${unresolvedItems.length} 项待决策。`
        : "方案正在同步，稍后即可预检。";

  return (
    <div className="flex h-full flex-col bg-transparent @container">
      <div className="flex-1 overflow-y-auto px-4 py-4 lg:px-6">
        <div className="mx-auto max-w-[1380px] space-y-4">
          <section className="rounded-[12px] border border-on-surface/8 bg-surface-container-lowest shadow-[0_20px_40px_rgba(0,0,0,0.04)]">
            <div className="border-b border-on-surface/6 px-5 py-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                <div className="space-y-1">
                  <div className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-primary/70">
                    <Layers className="h-3.5 w-3.5" />
                    当前整理方案
                  </div>
                  <h2 className="text-[18px] font-bold tracking-tight text-on-surface">先看待处理，再核对目标结构</h2>
                  <div className="mt-2 text-[13px] text-ui-muted opacity-80 overflow-hidden [&>div>p]:mb-1 [&>div>p:last-child]:mb-0">
                    {plan.summary ? <MarkdownProse content={plan.summary} /> : "目录树、待处理队列和条目检查器会在这里同步更新。"}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-on-surface/8 bg-surface px-3 py-1 text-[12px] font-semibold text-on-surface">移动 {plan.stats.move_count}</span>
                  <span className="rounded-full border border-on-surface/8 bg-surface px-3 py-1 text-[12px] font-semibold text-on-surface">新目录 {plan.stats.directory_count}</span>
                  <span className={cn("rounded-full border px-3 py-1 text-[12px] font-semibold", blockingQueueCount > 0 ? "border-warning/18 bg-warning/10 text-warning" : "border-success/18 bg-success/10 text-success-dim")}>
                    {blockingQueueCount > 0 ? `待处理 ${blockingQueueCount}` : "可开始预检"}
                  </span>
                </div>
              </div>
            </div>

            <div className="border-b border-on-surface/6 px-5 py-4">
              <div className="flex flex-wrap items-center gap-3">
                <div className="inline-flex rounded-[8px] border border-on-surface/8 bg-surface p-1">
                  <button type="button" onClick={() => setViewMode("before")} className={cn("rounded-[6px] px-3 py-1.5 text-[12px] font-semibold", viewMode === "before" ? "bg-on-surface text-surface" : "text-on-surface-variant")}>整理前</button>
                  <button type="button" onClick={() => setViewMode("after")} className={cn("rounded-[6px] px-3 py-1.5 text-[12px] font-semibold", viewMode === "after" ? "bg-primary text-white" : "text-on-surface-variant")}>整理后</button>
                </div>
                <select value={filter} onChange={(event) => setFilter(event.target.value as PreviewFilter)} className="h-10 rounded-[8px] border border-on-surface/8 bg-surface px-3 text-[12px] text-on-surface outline-none">
                  <option value="all">全部条目</option>
                  <option value="changed">只看变更</option>
                  <option value="unresolved">只看待决策</option>
                  <option value="review">只看待核对</option>
                  <option value="invalidated">只看需重新确认</option>
                </select>
                <label className="flex h-10 min-w-[200px] flex-1 items-center gap-2 rounded-[8px] border border-on-surface/8 bg-surface px-3">
                  <Search className="h-4 w-4 text-ui-muted" />
                  <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索文件名、路径、摘要" className="w-full bg-transparent text-[12px] text-on-surface outline-none placeholder:text-ui-muted" />
                </label>
                <select value={extensionFilter} onChange={(event) => setExtensionFilter(event.target.value)} className="h-10 rounded-[8px] border border-on-surface/8 bg-surface px-3 text-[12px] text-on-surface outline-none">
                  {extensionOptions.map((option) => <option key={option} value={option}>{option === "all" ? "全部类型" : option}</option>)}
                </select>
                <div className="flex items-center rounded-[8px] border border-on-surface/8 bg-surface px-3 text-[12px] text-ui-muted">当前显示 {filteredItems.length} / {allItems.length}</div>
              </div>
            </div>

            <div className="flex flex-col gap-4 p-4 min-w-0 @4xl:flex-row">
              <section className="flex-1 min-w-0 rounded-[10px] border border-on-surface/8 bg-surface p-3">
                <div className="mb-3">
                  <h3 className="text-[13px] font-bold text-on-surface">结构预览</h3>
                  <p className="text-[12px] text-ui-muted">点击左侧条目后，右侧会显示更完整的检查信息和调整动作。</p>
                </div>
                <div className="min-h-[420px] space-y-1">
                  {currentTree.length > 0 ? currentTree.map((node) => (
                    <TreeBranch
                      key={node.path}
                      node={node}
                      depth={0}
                      expanded={expanded}
                      selectedItemId={selectedItemId}
                      onToggle={(path) => setExpanded((prev) => ({ ...prev, [path]: !(prev[path] ?? true) }))}
                      onSelectItem={setSelectedItemId}
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

              <aside className="w-full shrink-0 space-y-3 @4xl:w-[380px]">
                <QueueCard title="需重新确认" items={invalidatedItems} selectedItemId={selectedItemId} onSelectItem={setSelectedItemId} onShowAll={() => setFilter("invalidated")} tone="border-error/12 bg-error-container/20" />
                <QueueCard title="待决策" items={unresolvedItems} selectedItemId={selectedItemId} onSelectItem={setSelectedItemId} onShowAll={() => setFilter("unresolved")} tone="border-warning/12 bg-warning-container/25" />
                <QueueCard title="待核对" items={reviewItems} selectedItemId={selectedItemId} onSelectItem={setSelectedItemId} onShowAll={() => setFilter("review")} tone="border-primary/12 bg-primary/5" />

                <section className="rounded-[10px] border border-on-surface/8 bg-surface p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[12px] font-bold uppercase tracking-[0.14em] text-ui-muted">条目检查器</p>
                      <h3 className="mt-1 text-[16px] font-bold tracking-tight text-on-surface">{selectedItem?.display_name || "选择一个条目"}</h3>
                    </div>
                    {selectedItem ? (
                      <span className={cn("rounded-full border px-2.5 py-1 text-[11px] font-bold", statusMeta(selectedItem.status).tone)}>
                        {statusMeta(selectedItem.status).label}
                      </span>
                    ) : null}
                  </div>

                  {selectedItem ? (
                    <div className="mt-4 space-y-4">
                      <div className="grid gap-2">
                        <div className="rounded-[8px] border border-on-surface/8 bg-surface-container-lowest px-3 py-2">
                          <div className="text-[11px] font-semibold text-ui-muted">原路径</div>
                          <div className="mt-1 break-all text-[12px] text-on-surface">{selectedItem.source_relpath}</div>
                        </div>
                        <div className="rounded-[8px] border border-on-surface/8 bg-surface-container-lowest px-3 py-2">
                          <div className="text-[11px] font-semibold text-ui-muted">目标路径</div>
                          <div className="mt-1 break-all text-[12px] text-on-surface">{selectedItem.target_relpath || "当前目录"}</div>
                        </div>
                      </div>

                      <div className="grid gap-2 @sm:grid-cols-2">
                        <div className="min-w-0 flex-1 rounded-[8px] border border-on-surface/8 bg-surface-container-lowest px-3 py-2">
                          <div className="text-[11px] font-semibold text-ui-muted">归类理由</div>
                          <div className="mt-1 text-[12px] leading-5 text-on-surface [&>div>p]:mb-1 [&>div>p:last-child]:mb-0">
                            {selectedItem.reason || selectedItem.suggested_purpose ? (
                              <MarkdownProse content={selectedItem.reason || selectedItem.suggested_purpose!} />
                            ) : "当前没有额外理由说明。"}
                          </div>
                        </div>
                        <div className="min-w-0 flex-1 rounded-[8px] border border-on-surface/8 bg-surface-container-lowest px-3 py-2">
                          <div className="text-[11px] font-semibold text-ui-muted">摘要 / 置信度</div>
                          <div className="mt-1 text-[12px] leading-5 text-on-surface [&>div>p]:mb-1 [&>div>p:last-child]:mb-0">
                            {selectedItem.content_summary ? (
                              <MarkdownProse content={selectedItem.content_summary} />
                            ) : "当前没有摘要。"}
                            {typeof selectedItem.confidence === "number" ? `（${Math.round(selectedItem.confidence * 100)}%）` : ""}
                          </div>
                        </div>
                      </div>

                      {!readOnly ? (
                        <>
                          <div className="space-y-2">
                            <div className="text-[12px] font-semibold text-on-surface">快速调整目标目录</div>
                            <div className="flex flex-wrap gap-2">
                              {availableDirectories.slice(0, 8).map((directory) => (
                                <button
                                  key={`${selectedItem.item_id}-${directory}`}
                                  type="button"
                                  onClick={() => void applyItemTarget(selectedItem.item_id, directory === "Review" ? { move_to_review: true } : { target_dir: directory })}
                                  className={cn(
                                    "rounded-full border px-3 py-1.5 text-[12px] font-semibold transition-colors",
                                    targetDir(selectedItem) === directory ? "border-primary/22 bg-primary/8 text-primary" : "border-on-surface/8 bg-surface-container-lowest text-on-surface hover:bg-on-surface/[0.03]",
                                  )}
                                >
                                  {directory}
                                </button>
                              ))}
                            </div>
                          </div>

                          <div className="space-y-2">
                            <button type="button" onClick={() => setShowManualInput((current) => !current)} className="text-[12px] font-semibold text-primary">
                              {showManualInput ? "收起高级路径输入" : "高级路径输入"}
                            </button>
                            {showManualInput ? (
                              <div className="flex gap-2">
                                <input value={manualTarget} onChange={(event) => setManualTarget(event.target.value)} placeholder="输入相对目录，例如 项目资料/归档" className="h-10 min-w-0 flex-1 rounded-[8px] border border-on-surface/8 bg-surface-container-lowest px-3 text-[12px] text-on-surface outline-none" />
                                <button type="button" onClick={() => void applyItemTarget(selectedItem.item_id, { target_dir: manualTarget.trim() })} className="shrink-0 rounded-[8px] bg-on-surface px-4 text-[12px] font-semibold text-surface">
                                  应用
                                </button>
                              </div>
                            ) : null}
                          </div>

                          <div className="space-y-2 rounded-[10px] border border-on-surface/8 bg-surface-container-low px-3 py-3">
                            <div>
                              <p className="text-[12px] font-semibold text-on-surface">批量动作</p>
                              <p className="text-[11px] leading-5 text-ui-muted">先按当前选中条目推断一组更稳妥的批量处理。</p>
                            </div>
                            <div className="flex flex-col gap-2">
                              <button type="button" disabled={sameSuggestedDirItems.length <= 1 || !targetDir(selectedItem)} onClick={() => void applyBatch(sameSuggestedDirItems, { target_dir: targetDir(selectedItem) })} className="rounded-[8px] border border-on-surface/8 bg-surface px-3 py-2 text-left text-[12px] font-semibold text-on-surface disabled:opacity-40">
                                按当前建议批量确认
                                <span className="ml-2 text-ui-muted">同目标目录 {sameSuggestedDirItems.length} 项</span>
                              </button>
                              <button type="button" disabled={extMatchedItems.length <= 1 || !targetDir(selectedItem)} onClick={() => void applyBatch(extMatchedItems, { target_dir: targetDir(selectedItem) })} className="rounded-[8px] border border-on-surface/8 bg-surface px-3 py-2 text-left text-[12px] font-semibold text-on-surface disabled:opacity-40">
                                按扩展名批量套用到同目录
                                <span className="ml-2 text-ui-muted">{currentExt || "无"} · {extMatchedItems.length} 项</span>
                              </button>
                              <button type="button" disabled={extMatchedItems.length <= 1} onClick={() => void applyBatch(extMatchedItems, { move_to_review: true })} className="rounded-[8px] border border-warning/18 bg-warning/8 px-3 py-2 text-left text-[12px] font-semibold text-warning disabled:opacity-40">
                                按扩展名批量移入 Review
                                <span className="ml-2 text-warning/80">{currentExt || "无"} · {extMatchedItems.length} 项</span>
                              </button>
                            </div>
                          </div>
                        </>
                      ) : null}
                    </div>
                  ) : (
                    <div className="mt-4 rounded-[8px] border border-dashed border-on-surface/10 bg-on-surface/[0.02] px-4 py-6 text-[12px] text-ui-muted">
                      选择目录树或待处理队列中的条目后，这里会显示更完整的解释和可见操作。
                    </div>
                  )}
                </section>
              </aside>
            </div>
          </section>
        </div>
      </div>
      {!readOnly ? (
        <div className="shrink-0 border-t border-on-surface/8 bg-surface-container-low px-4 py-3 lg:px-6">
          <div className="mb-2 flex items-center gap-2 text-[13px] text-on-surface">
            {canRunPrecheck ? <CheckCircle2 className="h-4 w-4 text-success-dim" /> : <AlertTriangle className="h-4 w-4 text-warning" />}
            <span>{precheckNotice}</span>
          </div>
          <button type="button" onClick={onRunPrecheck} disabled={isBusy || !canRunPrecheck} className={cn("flex w-full items-center justify-center gap-2 rounded-[10px] py-3 text-[14px] font-semibold transition-colors", canRunPrecheck && !isBusy ? "bg-primary text-white" : "cursor-not-allowed border border-on-surface/8 bg-on-surface/[0.05] text-ui-muted")}>
            <Layers className="h-4 w-4" />
            {isBusy ? "正在更新方案" : canRunPrecheck ? "开始预检" : "先处理待处理队列"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
