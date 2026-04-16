"use client";

import { AlertTriangle, ArrowLeft, CheckCircle2, Folder, History, Info, Layers, RotateCcw, ShieldCheck } from "lucide-react";
import { JournalSummary } from "@/types/session";
import { cn } from "@/lib/utils";
import { DirectoryTreeDiff, type DirectoryTreeLeafEntry, type DirectoryTreeFilter } from "./directory-tree-diff";
import { useState } from "react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { MarkdownProse } from "./markdown-prose";


interface CompletionViewProps {
  journal: JournalSummary | null;
  summary: string;
  loading: boolean;
  targetDir: string;
  isBusy: boolean;
  readOnly?: boolean;
  onOpenExplorer: (path?: string) => void;
  onCleanupDirs: () => void;
  onRollback: () => void;
  onGoHome: () => void;
}

export function CompletionView({
  journal,
  summary,
  loading,
  targetDir,
  isBusy,
  readOnly = false,
  onOpenExplorer,
  onCleanupDirs,
  onRollback,
  onGoHome,
}: CompletionViewProps) {
  const [filter, setFilter] = useState<DirectoryTreeFilter>("all");
  const [rollbackConfirmOpen, setRollbackConfirmOpen] = useState(false);

  if (loading) {
    return (
      <div className="mx-auto max-w-[1360px] animate-pulse space-y-4 py-5">
        <div className="h-24 rounded-[8px] bg-surface-container-low" />
        <div className="grid gap-3 md:grid-cols-4">
          <div className="h-20 rounded-[10px] bg-surface-container-low" />
          <div className="h-20 rounded-[10px] bg-surface-container-low" />
          <div className="h-20 rounded-[10px] bg-surface-container-low" />
          <div className="h-20 rounded-[10px] bg-surface-container-low" />
        </div>
        <div className="h-[420px] rounded-[8px] bg-surface-container-low" />
      </div>
    );
  }

  if (!journal) {
    return (
      <div className="rounded-[8px] border border-on-surface/8 bg-surface-container-lowest p-12 text-center shadow-[0_8px_24px_rgba(0,0,0,0.04)]">
        <History className="mx-auto mb-4 h-12 w-12 text-on-surface-variant/20" />
        <p className="text-sm font-medium text-on-surface-variant">这里暂时还没有可显示的结果。</p>
      </div>
    );
  }

  const allItems = journal.items || [];
  const moveItems = allItems.filter((item) => item.action_type === "MOVE");
  const mkdirItems = allItems.filter((item) => item.action_type === "MKDIR" && item.target);
  const failedItems = moveItems.filter((item) => item.status === "failed");
  const reviewItems = moveItems.filter((item) =>
    (item.target || "").split(/[\\/]/).some((part) => part.toLowerCase() === "review"),
  );
  const isPartial = (journal.failure_count || 0) > 0;
  const baseLabel = targetDir.split(/[\\/]/).filter(Boolean).at(-1) || "当前目录";

  const beforeTree = {
    title: "整理前目录树",
    subtitle: "执行前参与本次整理的原始文件位置。",
    leafEntries: moveItems
      .filter((item): item is typeof item & { source: string } => Boolean(item.source))
      .map<DirectoryTreeLeafEntry>((item) => ({ path: itemSourceToPath(item.source) })),
    basePath: targetDir,
    baseLabel,
    emptyLabel: "当前没有可展示的原始文件结构。",
  };

  /**
   * Helper to fix TS issues with item models vs path strings
   */
  function itemSourceToPath(source: any): string {
    return typeof source === 'string' ? source : (source?.path || "");
  }

  const afterTree = {
    title: "整理后目录树",
    subtitle: "执行后的目标目录结构。成功、失败与 Review 会在树中直接标出。",
    leafEntries: moveItems
      .filter((item): item is typeof item & { target: string } => Boolean(item.target))
      .map<DirectoryTreeLeafEntry>((item) => ({
        path: item.target,
        status: item.status === "failed"
          ? "failed"
          : item.target.split(/[\\/]/).some((part) => part.toLowerCase() === "review")
            ? "review"
            : "success",
      })),
    directoryEntries: mkdirItems
      .map((item) => item.target)
      .filter((target): target is string => Boolean(target)),
    basePath: targetDir,
    baseLabel,
    emptyLabel: "当前没有可展示的目标目录结构。",
  };

  return (
    <div className="flex h-full w-full flex-col overflow-hidden @container bg-surface">
      <div className="shrink-0 px-4 py-4 lg:px-6">
        <section className="overflow-hidden rounded-[12px] border border-on-surface/8 bg-surface-container-lowest shadow-[0_8px_32px_rgba(0,0,0,0.06)]">
          <div className="border-b border-on-surface/6 bg-on-surface/[0.01] px-5 py-3.5 lg:px-6">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <div className={cn("flex h-6 w-6 items-center justify-center rounded-[6px]", isPartial ? "bg-error/10 text-error" : "bg-success/10 text-success-dim")}>
                    {isPartial ? <AlertTriangle className="h-3.5 w-3.5" /> : <ShieldCheck className="h-3.5 w-3.5" />}
                  </div>
                  <h2 className="font-headline text-[15px] font-bold tracking-tight text-on-surface">
                    {isPartial ? "部分条目整理未完成" : "本次整理已顺利执行"}
                  </h2>
                </div>
                <div className="text-[12px] leading-relaxed text-ui-muted pl-8 max-w-[600px] truncate">
                  {summary ? <span>{summary}</span> : "文件已按方案完成移动。"}
                </div>
              </div>

              <div className="flex shrink-0 items-center justify-end">
                  <div className="flex flex-col items-end gap-0.5 text-right">
                    <span className="text-[10px] font-bold text-ui-muted uppercase tracking-widest opacity-60">目标目录</span>
                    <span className="text-[11px] font-mono text-on-surface/80 max-w-[240px] truncate bg-on-surface/5 px-2 py-0.5 rounded-[4px]" title={targetDir}>{targetDir}</span>
                  </div>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-8 bg-surface-container-lowest px-5 py-3 lg:px-6">
            {[
              { label: "成功移动", count: journal.success_count || 0, icon: CheckCircle2, color: "text-primary", bg: "bg-primary/5" },
              { label: "执行失败", count: journal.failure_count || 0, icon: AlertTriangle, color: isPartial ? "text-error" : "text-ui-muted", bg: isPartial ? "bg-error/10" : "bg-on-surface/5" },
              { label: "Review 保留", count: reviewItems.length, icon: Layers, color: "text-warning", bg: "bg-warning/10" },
              { label: "总计条目", count: journal.item_count || 0, icon: Folder, color: "text-ui-muted", bg: "bg-on-surface/5" },
            ].map((stat, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-[6px]", stat.bg, stat.color)}>
                  <stat.icon className="h-4 w-4" />
                </div>
                <div className="flex items-baseline gap-1.5">
                  <span className={cn("font-headline text-[16px] font-bold tracking-tight leading-none", stat.color === "text-ui-muted" ? "text-on-surface" : stat.color)}>{stat.count}</span>
                  <span className="text-[11px] font-medium text-ui-muted opacity-80">{stat.label}</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="flex-1 min-h-0 flex flex-col px-4 pb-4 lg:px-6 gap-4">
        <section className="flex-1 flex flex-col min-h-0 overflow-hidden rounded-[12px] border border-on-surface/8 bg-surface-container-lowest shadow-[0_4px_16px_rgba(0,0,0,0.02)]">
          <div className="shrink-0 flex items-center justify-between border-b border-on-surface/6 bg-on-surface/[0.01] px-4 py-2.5">
            <h3 className="text-[13px] font-bold font-headline text-on-surface flex items-center gap-2">
              <History className="h-4 w-4 opacity-40" />
              执行前后结构变化
            </h3>
            <div className="flex items-center gap-1 rounded-[6px] border border-on-surface/8 bg-surface p-1 shadow-sm">
              {[
                { id: "all", label: "全部" },
                { id: "failed", label: `失败 (${journal.failure_count || 0})` },
                { id: "review", label: `Review (${reviewItems.length})` },
              ].map((btn) => (
                <button
                  key={btn.id}
                  onClick={() => setFilter(btn.id as DirectoryTreeFilter)}
                  className={cn(
                    "rounded-[4px] px-3.5 py-1.5 text-[11px] font-bold transition-all",
                    filter === btn.id
                      ? "bg-on-surface/8 text-on-surface shadow-sm"
                      : "text-ui-muted hover:text-on-surface hover:bg-on-surface/5",
                  )}
                >
                  {btn.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto min-h-0 bg-surface">
            <DirectoryTreeDiff before={beforeTree} after={afterTree} filter={filter} />
          </div>
        </section>

        {(failedItems.length > 0 || reviewItems.length > 0) ? (
          <section className="shrink-0 max-h-[35%] overflow-hidden flex flex-col gap-3">
            <div className={cn("grid gap-4", (failedItems.length > 0 && reviewItems.length > 0) ? "lg:grid-cols-2" : "grid-cols-1")}>
              {failedItems.length > 0 && (
                <div className="flex flex-col rounded-[12px] border border-error/12 bg-error-container/10 overflow-hidden">
                  <div className="flex items-center gap-2 px-4 py-2.5 border-b border-error/8 bg-error/5">
                    <AlertTriangle className="h-4 w-4 text-error" />
                    <h3 className="text-[13px] font-bold text-error">异常项整理失败 ({failedItems.length})</h3>
                  </div>
                  <div className="flex-1 overflow-y-auto p-2 max-h-[180px] scrollbar-thin">
                    <div className="grid grid-cols-1 @[800px]:grid-cols-2 @[1200px]:grid-cols-3 gap-1.5 focus:outline-none">
                      {failedItems.map((item, idx) => (
                        <div key={idx} className="flex items-center justify-between gap-3 px-3 py-1.5 rounded-[6px] hover:bg-error/5 transition-colors border border-transparent hover:border-error/10">
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[12px] font-medium text-on-surface" title={item.display_name}>{item.display_name}</p>
                            <p className="truncate text-[10px] text-error/60 font-mono" title={item.target || ""}>{item.target}</p>
                          </div>
                          <AlertTriangle className="h-3 w-3 text-error/30 shrink-0" />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {reviewItems.length > 0 && (
                <div className="flex flex-col rounded-[12px] border border-warning/15 bg-warning-container/10 overflow-hidden">
                  <div className="flex items-center gap-2 px-4 py-2.5 border-b border-warning/10 bg-warning/5">
                    <Info className="h-4 w-4 text-warning" />
                    <h3 className="text-[13px] font-bold text-warning-dim">归档至 Review 目录 ({reviewItems.length})</h3>
                  </div>
                  <div className="flex-1 overflow-y-auto p-2 max-h-[180px] scrollbar-thin">
                    <div className="grid grid-cols-1 @[800px]:grid-cols-2 @[1200px]:grid-cols-3 gap-1.5 focus:outline-none">
                      {reviewItems.map((item, idx) => (
                        <div key={idx} className="flex items-center justify-between gap-3 px-3 py-1.5 rounded-[6px] hover:bg-warning/5 transition-colors border border-transparent hover:border-warning/10">
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[12px] font-medium text-on-surface" title={item.display_name}>{item.display_name}</p>
                            <p className="truncate text-[10px] text-warning-dim/60 font-mono" title={item.target || ""}>{item.target}</p>
                          </div>
                          <Layers className="h-3 w-3 text-warning/30 shrink-0" />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </section>
        ) : null}
      </div>

      <div className="shrink-0 border-t border-on-surface/8 bg-surface-container-lowest px-4 py-3 lg:px-6">
        <div className={cn("flex items-center justify-between gap-4", readOnly ? "flex-row-reverse" : "")}>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onGoHome}
              disabled={isBusy}
              className="group flex h-9 items-center justify-center gap-2 rounded-[8px] border border-on-surface/10 bg-surface-container-lowest px-4 text-[13px] font-bold text-on-surface-variant transition-all hover:bg-on-surface/5 active:scale-95 disabled:opacity-50"
            >
              <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
              返回首页
            </button>
            <button
              type="button"
              onClick={() => onOpenExplorer(targetDir)}
              disabled={isBusy}
              className="flex h-9 items-center justify-center gap-2 rounded-[8px] bg-primary px-5 text-[13px] font-bold text-white transition-all hover:bg-primary-dim hover:shadow-lg active:scale-95 disabled:opacity-50"
            >
              <Folder className="h-4 w-4" />
              打开目录
            </button>
          </div>

          {!readOnly && (
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={onCleanupDirs}
                disabled={isBusy}
                className="flex h-9 items-center justify-center gap-2 rounded-[8px] border border-on-surface/10 bg-surface-container-lowest px-4 text-[13px] font-bold text-on-surface-variant transition-all hover:bg-on-surface/5 active:scale-95 disabled:opacity-50"
              >
                <CheckCircle2 className="h-4 w-4 opacity-60" />
                清理空目录
              </button>
              <div className="h-4 w-px bg-on-surface/10 mx-1" />
              <button
                type="button"
                onClick={() => setRollbackConfirmOpen(true)}
                disabled={isBusy}
                className="flex h-9 items-center justify-center gap-2 rounded-[8px] border border-error/20 bg-error-container/10 px-4 text-[13px] font-bold text-error transition-all hover:bg-error-container/20 active:scale-95 disabled:opacity-50"
              >
                <RotateCcw className="h-4 w-4" />
                危险：还原操作
              </button>
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={rollbackConfirmOpen}
        title="确认回退这次整理？"
        description="这会尝试把本次整理移动过的文件放回原位置。已经存在冲突或被占用的文件，回退时仍可能失败。"
        confirmLabel="开始回退"
        cancelLabel="先不回退"
        tone="danger"
        loading={isBusy}
        onConfirm={() => {
          setRollbackConfirmOpen(false);
          onRollback();
        }}
        onCancel={() => setRollbackConfirmOpen(false)}
      />
    </div>
  );
}
