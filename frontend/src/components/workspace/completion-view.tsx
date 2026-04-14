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
    <div className="mx-auto flex h-full w-full max-w-[1360px] flex-col overflow-hidden px-4 py-5 lg:px-6 animate-in fade-in slide-in-from-bottom-4 duration-500 @container">
      <div className="shrink-0 space-y-4">
      <section className="overflow-hidden rounded-[8px] border border-on-surface/8 bg-surface-container-lowest shadow-[0_12px_44px_rgba(0,0,0,0.06)]">
        <div className="border-b border-on-surface/6 bg-on-surface/[0.015] px-5 py-4 lg:px-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <div className={cn("flex h-6 w-6 items-center justify-center rounded-[4px]", isPartial ? "bg-error/10 text-error" : "bg-success/10 text-success-dim")}>
                  {isPartial ? <AlertTriangle className="h-3.5 w-3.5" /> : <ShieldCheck className="h-3.5 w-3.5" />}
                </div>
                <h2 className="font-headline text-[14px] font-bold tracking-tight text-on-surface">
                  {isPartial ? "部分条目整理未完成" : "本次整理已顺利执行"}
                </h2>
              </div>
              <div className="text-[11.5px] leading-relaxed text-ui-muted pl-8 md:max-w-[500px] truncate">
                {summary ? <span className="truncate">{summary}</span> : "文件已按方案完成移动。"}
              </div>
            </div>

            <div className="flex shrink-0 items-center justify-end">
                <div className="flex flex-col items-end gap-1 text-right">
                  <span className="text-[10px] font-medium text-ui-muted uppercase tracking-widest">目标目录</span>
                  <span className="text-[11px] font-mono text-on-surface max-w-[200px] truncate" title={targetDir}>{targetDir}</span>
                </div>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-6 border-b border-on-surface/4 bg-surface-container-lowest px-5 py-2.5 lg:px-6">
          <div className="flex items-center gap-2.5">
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[4px] bg-primary/6 text-primary">
              <CheckCircle2 className="h-3.5 w-3.5" />
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="font-headline text-[14px] font-bold tracking-tight text-on-surface leading-none">{journal.success_count || 0}</span>
              <span className="text-[10px] font-medium text-ui-muted opacity-80">成功移动</span>
            </div>
          </div>

          <div className="h-3.5 w-px bg-on-surface/10" />

          <div className="flex items-center gap-2.5">
            <div className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-[4px]", isPartial ? "bg-error/15 text-error" : "bg-on-surface/5 text-ui-muted")}>
              <AlertTriangle className="h-3.5 w-3.5" />
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className={cn("font-headline text-[14px] font-bold tracking-tight leading-none", isPartial ? "text-error" : "text-on-surface")}>{journal.failure_count || 0}</span>
              <span className="text-[10px] font-medium text-ui-muted opacity-80">执行失败</span>
            </div>
          </div>

          <div className="h-3.5 w-px bg-on-surface/10" />

          <div className="flex items-center gap-2.5">
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[4px] bg-warning/15 text-warning">
              <Layers className="h-3.5 w-3.5" />
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="font-headline text-[14px] font-bold tracking-tight text-on-surface leading-none">{reviewItems.length}</span>
              <span className="text-[10px] font-medium text-ui-muted opacity-80">Review 保留</span>
            </div>
          </div>
          
          <div className="h-3.5 w-px bg-on-surface/10" />

          <div className="flex items-center gap-2.5">
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[4px] bg-on-surface/5 text-ui-muted">
              <Folder className="h-3.5 w-3.5" />
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="font-headline text-[14px] font-bold tracking-tight text-on-surface leading-none">{journal.item_count || 0}</span>
              <span className="text-[10px] font-medium text-ui-muted opacity-80">总计条目</span>
            </div>
          </div>
        </div>
      </section>
      </div>

      <div className="mt-3 flex-1 min-h-0 flex flex-col gap-3 pr-1">
      <section className="flex-1 flex flex-col min-h-0 overflow-hidden rounded-[8px] border border-on-surface/8 bg-surface-container-lowest shadow-[0_4px_16px_rgba(0,0,0,0.02)]">
        <div className="shrink-0 flex items-center justify-between border-b border-on-surface/6 bg-on-surface/[0.01] px-4 py-2">
            <h3 className="text-[12.5px] font-bold font-headline text-on-surface">执行前后结构变化</h3>
          <div className="flex items-center gap-0.5 rounded-[4px] border border-on-surface/8 bg-surface p-0.5 shadow-sm">
            {[
              { id: "all", label: "全部" },
              { id: "failed", label: `失败 (${journal.failure_count || 0})` },
              { id: "review", label: `Review (${reviewItems.length})` },
            ].map((btn) => (
              <button
                key={btn.id}
                onClick={() => setFilter(btn.id as DirectoryTreeFilter)}
                className={cn(
                  "rounded-[3px] px-3 py-1 text-[11px] font-semibold transition-colors",
                  filter === btn.id
                    ? "bg-on-surface/[0.06] text-on-surface"
                    : "text-ui-muted hover:text-on-surface hover:bg-on-surface/[0.03]",
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
        <section className="shrink-0 max-h-[35%] overflow-y-auto space-y-3 scrollbar-thin">
          <div className="grid gap-3 lg:grid-cols-2">
            {failedItems.length > 0 ? (
              <div className={cn("rounded-[6px] border p-4 shadow-sm", journal.failure_count && journal.failure_count > 0 ? "border-error/15 bg-error-container/25" : "border-error/12 bg-error-container/15")}>
                <div className="flex items-center gap-2.5">
                  <AlertTriangle className="h-4 w-4 text-error" />
                  <h3 className="text-[14px] font-bold text-on-surface">异常项分析</h3>
                </div>
                <p className="mt-1.5 text-[12px] leading-5 text-ui-muted">
                  这些文件可能被其他程序占用，或者缺失写入权限。
                </p>
                <div className="mt-2.5 space-y-2">
                  {failedItems.slice(0, 6).map((item) => (
                    <div key={`${item.display_name}-${item.target}`} className="rounded-[4px] border border-error/10 bg-surface-container-lowest px-3 py-2 text-sm">
                      <p className="truncate font-medium text-[13px] text-on-surface" title={item.display_name}>{item.display_name}</p>
                      <p className="mt-0.5 truncate text-[11.5px] text-ui-muted" title={item.target || ""}>
                        目标位置：{item.target || "未知"}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {reviewItems.length > 0 ? (
              <div className="rounded-[6px] border border-warning/12 bg-warning-container/22 p-4 shadow-sm">
                <div className="flex items-center gap-2.5">
                  <span className="text-warning">
                    <Info className="h-4 w-4" />
                  </span>
                  <h3 className="text-[14px] font-bold text-on-surface">Review 归档记录</h3>
                </div>
                <p className="mt-1.5 text-[12px] leading-5 text-ui-muted">
                  文件按策略暂时存放在 `Review` 目录，建议手动查看确认。
                </p>
                <div className="mt-2.5 space-y-2">
                  {reviewItems.slice(0, 6).map((item) => (
                    <div key={`${item.display_name}-${item.target}`} className="rounded-[4px] border border-warning/10 bg-surface-container-lowest px-3 py-2 text-sm">
                      <p className="truncate font-medium text-[13px] text-on-surface" title={item.display_name}>{item.display_name}</p>
                      <p className="mt-0.5 truncate text-[11.5px] text-ui-muted" title={item.target || ""}>
                        当前位置：{item.target || "Review"}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </section>
      ) : null}
      </div>

      <div className="mt-3 shrink-0">
      <section className={cn("rounded-[8px] border border-on-surface/8 bg-surface px-4 py-3 shadow-sm", readOnly ? "flex flex-col gap-3" : "flex flex-col gap-3 md:flex-row md:items-center md:justify-between")}>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onGoHome}
            disabled={isBusy}
            className="flex h-8 items-center justify-center gap-1.5 rounded-[4px] border border-on-surface/10 bg-surface-container-lowest px-4 text-[12px] font-bold text-on-surface-variant transition-colors hover:bg-on-surface/5 active:scale-95 disabled:opacity-50"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            返回首页
          </button>
          <button
            type="button"
            onClick={() => onOpenExplorer(targetDir)}
            disabled={isBusy}
            className="flex h-8 items-center justify-center gap-1.5 rounded-[4px] bg-primary px-4 text-[12px] font-bold text-white transition-all hover:bg-primary/90 active:scale-95 disabled:opacity-50"
          >
            <Folder className="h-3.5 w-3.5" />
            打开目录
          </button>
        </div>
        {!readOnly ? (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onCleanupDirs}
              disabled={isBusy}
              className="flex h-8 items-center justify-center gap-1.5 rounded-[4px] border border-on-surface/8 bg-surface-container-lowest px-4 text-[12px] font-bold text-on-surface-variant transition-colors hover:bg-on-surface/5 active:scale-95 disabled:opacity-50"
            >
              <CheckCircle2 className="h-3.5 w-3.5 opacity-60" />
              清理空目录
            </button>
            <button
              type="button"
              onClick={() => setRollbackConfirmOpen(true)}
              disabled={isBusy}
              className="flex h-8 items-center justify-center gap-1.5 rounded-[4px] border border-error/10 bg-error-container/15 px-4 text-[12px] font-bold text-error transition-colors hover:bg-error-container/30 active:scale-95 disabled:opacity-50"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              危险：还原操作
            </button>
          </div>
        ) : null}
      </section>
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
