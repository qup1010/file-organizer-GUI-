"use client";

import { AlertTriangle, CheckCircle2, Folder, History, Info, RotateCcw, ShieldCheck, Sparkles } from "lucide-react";
import { JournalSummary } from "@/types/session";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { DirectoryTreeDiff, type DirectoryTreeLeafEntry } from "./directory-tree-diff";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface CompletionViewProps {
  journal: JournalSummary | null;
  loading: boolean;
  targetDir: string;
  isBusy: boolean;
  readOnly?: boolean;
  onOpenExplorer: () => void;
  onCleanupDirs: () => void;
  onRollback: () => void;
}

export function CompletionView({
  journal,
  loading,
  targetDir,
  isBusy,
  readOnly = false,
  onOpenExplorer,
  onCleanupDirs,
  onRollback,
}: CompletionViewProps) {
  if (loading) {
    return (
      <div className="mx-auto max-w-5xl space-y-6 py-8 animate-pulse">
        <div className="h-36 rounded-[2rem] bg-surface-container-low" />
        <div className="grid gap-4 md:grid-cols-3">
          <div className="h-28 rounded-[1.5rem] bg-surface-container-low" />
          <div className="h-28 rounded-[1.5rem] bg-surface-container-low" />
          <div className="h-28 rounded-[1.5rem] bg-surface-container-low" />
        </div>
        <div className="h-[420px] rounded-[2rem] bg-surface-container-low" />
      </div>
    );
  }

  if (!journal) {
    return (
      <div className="rounded-[2rem] border border-on-surface/6 bg-white/70 p-12 text-center shadow-sm">
        <History className="mx-auto mb-4 h-12 w-12 text-on-surface-variant/20" />
        <p className="text-sm font-medium text-on-surface-variant">当前没有可展示的执行记录。</p>
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
    subtitle: "执行完成后的目标目录结构，成功、失败与 Review 会在树中直接标出。",
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
    <div className="mx-auto max-w-6xl space-y-10 py-8">
      <div className="rounded-[2rem] border border-on-surface/6 bg-white/76 p-8 shadow-sm">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-3">
            <div
              className={cn(
                "inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-bold",
                isPartial
                  ? "border border-warning/15 bg-warning-container/20 text-warning"
                  : "border border-emerald-500/15 bg-emerald-500/10 text-emerald-600",
              )}
            >
              {isPartial ? <AlertTriangle className="h-3.5 w-3.5" /> : <ShieldCheck className="h-3.5 w-3.5" />}
              {isPartial ? "执行完成，存在部分失败" : "执行完成，目录已重组"}
            </div>
            <div>
              <h2 className="text-2xl font-black tracking-tight text-on-surface">
                {isPartial ? "整理已完成，但有少量文件未成功落位" : "整理已完成，目录结构已更新"}
              </h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-on-surface-variant">
                下面的目录树直接展示了执行前后的路径变化。你可以先核对结果，再决定是否打开目录、清理空目录或整批回退。
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-on-surface/8 bg-surface-container-low/55 px-4 py-3 text-sm text-on-surface-variant">
            目标目录：<span className="font-medium text-on-surface">{targetDir}</span>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-[1.5rem] border border-emerald-500/15 bg-white/78 p-5 shadow-sm">
          <div className="flex items-center gap-3 text-emerald-600">
            <CheckCircle2 className="h-4 w-4" />
            <span className="text-xs font-bold uppercase tracking-widest">成功落位</span>
          </div>
          <p className="mt-4 text-3xl font-black text-on-surface">{journal.success_count || 0}</p>
          <p className="mt-2 text-xs leading-5 text-on-surface-variant">这些文件已经移动到新的目录结构中。</p>
        </div>

        <div className="rounded-[1.5rem] border border-warning/15 bg-white/78 p-5 shadow-sm">
          <div className="flex items-center gap-3 text-warning">
            <AlertTriangle className="h-4 w-4" />
            <span className="text-xs font-bold uppercase tracking-widest">执行失败</span>
          </div>
          <p className="mt-4 text-3xl font-black text-on-surface">{journal.failure_count || 0}</p>
          <p className="mt-2 text-xs leading-5 text-on-surface-variant">失败项仍保留在原位置，树中会用红色状态直接标记。</p>
        </div>

        <div className="rounded-[1.5rem] border border-primary/12 bg-white/78 p-5 shadow-sm">
          <div className="flex items-center gap-3 text-primary">
            <Sparkles className="h-4 w-4" />
            <span className="text-xs font-bold uppercase tracking-widest">Review 留存</span>
          </div>
          <p className="mt-4 text-3xl font-black text-on-surface">{reviewItems.length}</p>
          <p className="mt-2 text-xs leading-5 text-on-surface-variant">这部分内容被有意保留到 `Review`，便于后续人工确认。</p>
        </div>
      </div>

      <div className="space-y-4">
        <div className="space-y-1">
          <h3 className="text-sm font-bold text-on-surface">目录树前后对比</h3>
          <p className="text-sm text-on-surface-variant">左侧为原始文件位置，右侧为这次执行后的实际目标结构。</p>
        </div>
        <DirectoryTreeDiff before={beforeTree} after={afterTree} />
      </div>

      {(failedItems.length > 0 || reviewItems.length > 0) ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {failedItems.length > 0 ? (
            <div className="rounded-[1.75rem] border border-error/12 bg-error-container/10 p-6">
              <div className="flex items-center gap-3">
                <AlertTriangle className="h-5 w-5 text-error" />
                <h3 className="text-sm font-bold text-on-surface">失败项说明</h3>
              </div>
              <p className="mt-2 text-sm leading-6 text-on-surface-variant">
                这些文件通常是因为被其他程序占用，或当前目录缺少写入权限而未能完成移动。
              </p>
              <div className="mt-4 space-y-2">
                {failedItems.slice(0, 6).map((item) => (
                  <div key={`${item.display_name}-${item.target}`} className="rounded-2xl border border-error/10 bg-white px-4 py-3 text-sm">
                    <p className="font-medium text-on-surface">{item.display_name}</p>
                    <p className="mt-1 text-xs text-on-surface-variant">
                      目标位置：{item.target || "未知"}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {reviewItems.length > 0 ? (
            <div className="rounded-[1.75rem] border border-warning/12 bg-warning-container/10 p-6">
              <div className="flex items-center gap-3">
                <Info className="h-5 w-5 text-warning" />
                <h3 className="text-sm font-bold text-on-surface">Review 留存说明</h3>
              </div>
              <p className="mt-2 text-sm leading-6 text-on-surface-variant">
                这部分内容不是执行失败，而是策略上保留在 `Review` 中，方便你稍后逐项确认。
              </p>
              <div className="mt-4 space-y-2">
                {reviewItems.slice(0, 6).map((item) => (
                  <div key={`${item.display_name}-${item.target}`} className="rounded-2xl border border-warning/10 bg-white px-4 py-3 text-sm">
                    <p className="font-medium text-on-surface">{item.display_name}</p>
                    <p className="mt-1 text-xs text-on-surface-variant">
                      当前位置：{item.target || "Review"}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className={cn("grid gap-4", readOnly ? "md:grid-cols-1" : "md:grid-cols-3")}>
        <button
          type="button"
          onClick={onOpenExplorer}
          disabled={isBusy}
          className="inline-flex items-center justify-center gap-3 rounded-[1.75rem] bg-on-surface px-5 py-5 text-sm font-bold text-white shadow-sm transition-opacity hover:opacity-92 disabled:opacity-40"
        >
          <Folder className="h-4 w-4" />
          打开整理后的目录
        </button>
        {!readOnly ? (
          <>
            <button
              type="button"
              onClick={onCleanupDirs}
              disabled={isBusy}
              className="inline-flex items-center justify-center gap-3 rounded-[1.75rem] border border-on-surface/8 bg-white px-5 py-5 text-sm font-bold text-on-surface transition-colors hover:bg-surface-container-low disabled:opacity-40"
            >
              <Info className="h-4 w-4" />
              清理残留空目录
            </button>
            <button
              type="button"
              onClick={() => {
                if (window.confirm("回退将尝试把本次移动过的文件恢复到原始位置，确认继续？")) {
                  onRollback();
                }
              }}
              disabled={isBusy}
              className="inline-flex items-center justify-center gap-3 rounded-[1.75rem] border border-error/12 bg-error-container/10 px-5 py-5 text-sm font-bold text-error transition-opacity hover:opacity-92 disabled:opacity-40"
            >
              <RotateCcw className="h-4 w-4" />
              整批回退本次整理
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}
