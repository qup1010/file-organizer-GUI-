"use client";

import { AlertTriangle, ArrowLeft, CheckCircle2, Folder, History, Info, Layers, RotateCcw, ShieldCheck } from "lucide-react";
import { JournalSummary } from "@/types/session";
import { cn } from "@/lib/utils";
import { DirectoryTreeDiff, type DirectoryTreeLeafEntry, type DirectoryTreeFilter } from "./directory-tree-diff";
import { useState } from "react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

interface CompletionViewProps {
  journal: JournalSummary | null;
  summary: string;
  loading: boolean;
  targetDir: string;
  isBusy: boolean;
  readOnly?: boolean;
  onOpenExplorer: () => void;
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
      .map<DirectoryTreeLeafEntry>((item) => ({ path: item.source })),
    basePath: targetDir,
    baseLabel,
    emptyLabel: "当前没有可展示的原始文件结构。",
  };

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
    <div className="mx-auto max-w-[1360px] animate-in fade-in slide-in-from-bottom-4 space-y-5 py-5 duration-500">
      <section className="overflow-hidden rounded-[12px] border border-on-surface/8 bg-surface-container-lowest shadow-[0_18px_44px_rgba(0,0,0,0.04)]">
        <div className="border-b border-on-surface/8 bg-surface px-4 py-3.5 lg:px-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-1.5">
              <div
                className={cn(
                  "inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-widest",
                  isPartial ? "bg-error-container/40 text-error border border-error/20" : "bg-success/10 text-success-dim border border-success/20",
                )}
              >
                {isPartial ? <AlertTriangle className="h-3.5 w-3.5" /> : <ShieldCheck className="h-3.5 w-3.5" />}
                {isPartial ? "部分完成" : "整理完成"}
              </div>
              <h2 className="text-[1.35rem] font-bold font-headline tracking-tight text-on-surface lg:text-[1.8rem] leading-[1.1]">
                {isPartial ? "请检查未完成的条目" : "这次整理已经完成"}
              </h2>
              <p className="max-w-2xl text-[14px] leading-7 text-ui-muted opacity-80">
                {summary || "文件已按方案完成移动。建议先看下方结果对比；如果结果不符合预期，可以回退这次整理。"}
              </p>
            </div>

            <div className="rounded-[10px] border border-on-surface/8 bg-surface-container-lowest px-4 py-2.5 font-mono">
              <div className="text-ui-meta text-ui-muted">目标目录</div>
              <div className="mt-1 text-[12px] font-medium text-on-surface">{targetDir}</div>
            </div>
          </div>
        </div>

        <div className="grid gap-2.5 p-4 sm:grid-cols-2 xl:grid-cols-4 lg:px-5 lg:pb-5">
          <div className="rounded-[12px] border border-on-surface/8 bg-surface-container-lowest px-5 py-5 shadow-sm">
            <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-ui-muted opacity-60">
              <CheckCircle2 className="h-3.5 w-3.5 text-success-dim" />
              成功移动
            </div>
            <p className="mt-2 text-[2.2rem] font-bold font-headline tracking-tighter text-success-dim leading-none">{journal.success_count || 0}</p>
          </div>
          <div className={cn(
            "rounded-[12px] border px-5 py-5 transition-colors shadow-sm",
            isPartial ? "border-error/25 bg-error-container/10 ring-1 ring-error/5" : "border-on-surface/8 bg-surface-container-lowest",
          )}>
            <div className={cn("flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider", isPartial ? "text-error" : "text-ui-muted opacity-60")}>
              <AlertTriangle className="h-3.5 w-3.5" />
              执行失败
            </div>
            <p className={cn("mt-2 text-[2.2rem] font-bold font-headline tracking-tighter leading-none", isPartial ? "text-error" : "text-on-surface")}>
              {journal.failure_count || 0}
            </p>
          </div>
          <div className="rounded-[12px] border border-on-surface/8 bg-surface-container-lowest px-5 py-5 shadow-sm">
            <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-ui-muted opacity-60">
              <Layers className="h-3.5 w-3.5 text-primary" />
              Review 保留
            </div>
            <p className="mt-2 text-[2.2rem] font-bold font-headline tracking-tighter text-on-surface leading-none">{reviewItems.length}</p>
          </div>
          <div className="rounded-[12px] border border-on-surface/8 bg-surface-container-lowest px-5 py-5 shadow-sm">
            <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-ui-muted opacity-60">
              <Folder className="h-3.5 w-3.5 text-primary" />
              合计项
            </div>
            <p className="mt-2 text-[2.2rem] font-bold font-headline tracking-tighter text-on-surface leading-none">{journal.item_count || 0}</p>
          </div>
        </div>
      </section>

      <section className="space-y-4 rounded-[12px] border border-on-surface/8 bg-surface-container-lowest p-5 shadow-[0_18px_44px_rgba(0,0,0,0.04)]">
        <div className="flex items-end justify-between gap-4 border-b border-on-surface/8 pb-4">
          <div className="space-y-1">
            <p className="text-[11px] font-bold uppercase tracking-widest text-ui-muted opacity-45">结果对比</p>
            <h3 className="text-[16px] font-bold font-headline tracking-tight text-on-surface">执行前后对比</h3>
          </div>
          <div className="flex items-center gap-1.5 rounded-[10px] border border-on-surface/8 bg-surface-container p-1">
            {[
              { id: "all", label: "全部结果" },
              { id: "failed", label: `失败项 (${journal.failure_count || 0})` },
              { id: "review", label: `Review (${reviewItems.length})` },
            ].map((btn) => (
              <button
                key={btn.id}
                onClick={() => setFilter(btn.id as DirectoryTreeFilter)}
                className={cn(
                  "rounded-[9px] px-5 py-2.2 text-[13px] font-bold transition-all",
                  filter === btn.id
                    ? "bg-surface-container-lowest text-primary shadow-md shadow-on-surface/5"
                    : "text-on-surface-variant/60 hover:text-on-surface",
                )}
              >
                {btn.label}
              </button>
            ))}
          </div>
        </div>
        <DirectoryTreeDiff before={beforeTree} after={afterTree} filter={filter} />
      </section>

      {(failedItems.length > 0 || reviewItems.length > 0) ? (
        <section className="grid gap-3 lg:grid-cols-2">
          {failedItems.length > 0 ? (
            <div className={cn("rounded-[12px] border p-4 shadow-[0_12px_28px_rgba(0,0,0,0.04)]", journal.failure_count && journal.failure_count > 0 ? "border-error/15 bg-error-container/25" : "border-error/12 bg-error-container/15")}>
              <div className="flex items-center gap-3">
                <AlertTriangle className="h-5 w-5 text-error" />
                <h3 className="text-[16px] font-bold font-headline tracking-tight text-on-surface">异常项分析</h3>
              </div>
              <p className="mt-2 text-[13px] leading-6 text-ui-muted">
                这些文件通常是因为正在被其他程序占用，或者当前目录没有写入权限。
              </p>
              <div className="mt-3 space-y-2">
                {failedItems.slice(0, 6).map((item) => (
                  <div key={`${item.display_name}-${item.target}`} className="rounded-[9px] border border-error/10 bg-surface-container-lowest px-3.5 py-2.5 text-sm">
                    <p className="truncate font-medium text-on-surface" title={item.display_name}>{item.display_name}</p>
                    <p className="mt-1 truncate text-[12px] text-ui-muted" title={item.target || ""}>
                      目标位置：{item.target || "未知"}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {reviewItems.length > 0 ? (
            <div className="rounded-[12px] border border-warning/12 bg-warning-container/22 p-4 shadow-[0_12px_28px_rgba(0,0,0,0.04)]">
              <div className="flex items-center gap-3">
                <Info className="h-5 w-5 text-warning" />
                <h3 className="text-[16px] font-bold font-headline tracking-tight text-on-surface">Review 归档记录</h3>
              </div>
              <p className="mt-2 text-[13px] leading-6 text-ui-muted">
                这部分不是执行失败，而是按策略先放在 `Review` 中，方便你稍后逐项确认。
              </p>
              <div className="mt-3 space-y-2">
                {reviewItems.slice(0, 6).map((item) => (
                  <div key={`${item.display_name}-${item.target}`} className="rounded-[9px] border border-warning/10 bg-surface-container-lowest px-3.5 py-2.5 text-sm">
                    <p className="truncate font-medium text-on-surface" title={item.display_name}>{item.display_name}</p>
                    <p className="mt-1 truncate text-[12px] text-ui-muted" title={item.target || ""}>
                      当前位置：{item.target || "Review"}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      <section className={cn("rounded-[12px] border border-on-surface/8 bg-surface px-4 py-4 shadow-[0_18px_44px_rgba(0,0,0,0.04)]", readOnly ? "flex flex-col gap-3" : "flex flex-col gap-3 md:flex-row md:items-center")}>
        <button
          type="button"
          onClick={onGoHome}
          disabled={isBusy}
          className="order-0 flex items-center justify-center gap-3 rounded-[10px] border border-on-surface/8 bg-surface-container-lowest px-5 py-3 text-sm font-medium text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface disabled:opacity-40"
        >
          <ArrowLeft className="h-4 w-4" />
          返回主页
        </button>
        <button
          type="button"
          onClick={onOpenExplorer}
          disabled={isBusy}
          className="order-1 flex items-center justify-center gap-3 rounded-[10px] border border-primary/20 bg-primary px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-primary-dim active:scale-[0.98] disabled:opacity-40"
        >
          <Folder className="h-4 w-4" />
          打开目录
        </button>
        {!readOnly ? (
          <>
            <button
              type="button"
              onClick={onCleanupDirs}
              disabled={isBusy}
              className="order-2 flex items-center justify-center gap-3 rounded-[12px] border border-on-surface/8 bg-surface-container-lowest px-6 py-3 text-sm font-bold text-on-surface-variant transition-all hover:bg-surface-container hover:text-on-surface active:scale-95 disabled:opacity-40"
            >
              <CheckCircle2 className="h-4 w-4 opacity-40" />
              清理空目录
            </button>
            <div className="hidden flex-1 md:block" />
            <button
              type="button"
              onClick={() => setRollbackConfirmOpen(true)}
              disabled={isBusy}
              className="order-3 flex items-center justify-center gap-3 rounded-[12px] border border-error/10 bg-error-container/15 px-6 py-3 text-sm font-bold text-error transition-all hover:bg-error-container/30 active:scale-95 disabled:opacity-40"
            >
              <RotateCcw className="h-4 w-4" />
              回退这次整理
            </button>
          </>
        ) : null}
      </section>

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
