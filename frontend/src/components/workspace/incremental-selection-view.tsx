"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowRightLeft, FolderTree, Inbox, Layers3, ScanSearch } from "lucide-react";

import type { SourceTreeEntry } from "@/types/session";
import { cn } from "@/lib/utils";

function normalizePath(value: string): string {
  return value.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "").trim();
}

export function IncrementalSelectionView({
  rootDirectoryOptions,
  sourceTreeEntries,
  loading,
  onConfirm,
}: {
  rootDirectoryOptions: string[];
  sourceTreeEntries: SourceTreeEntry[];
  loading: boolean;
  onConfirm: (selectedTargetDirs: string[]) => void;
}) {
  const [selected, setSelected] = useState<string[]>([]);

  useEffect(() => {
    setSelected([]);
  }, [rootDirectoryOptions]);

  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const rootEntries = useMemo(
    () =>
      sourceTreeEntries.filter((entry) => {
        const relpath = normalizePath(entry.source_relpath);
        return relpath && !relpath.includes("/");
      }),
    [sourceTreeEntries],
  );
  const pendingEntries = useMemo(
    () =>
      rootEntries.filter((entry) => {
        const relpath = normalizePath(entry.source_relpath);
        return !selectedSet.has(relpath);
      }),
    [rootEntries, selectedSet],
  );

  return (
    <div className="flex h-full flex-col bg-surface-container-lowest">
      <div className="border-b border-on-surface/8 bg-surface px-5 py-4">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-1.5 rounded-full border border-primary/12 bg-primary/8 px-2.5 py-0.5 text-[11px] font-bold text-primary">
              <Layers3 className="h-3.5 w-3.5" />
              归入已有目录
            </div>
            <h2 className="text-[22px] font-black tracking-tight text-on-surface">先选择目标目录</h2>
            <p className="max-w-[760px] text-[13px] leading-6 text-ui-muted">
              勾选那些已经整理好的根目录，系统会把它们作为目标目录池。其余根级条目会被视为本轮待整理项，随后再进入扫描与规划。
            </p>
          </div>
          <div className="rounded-[10px] border border-on-surface/8 bg-surface-container-low px-3 py-2 text-right">
            <div className="text-[11px] font-bold text-ui-muted">已选目标目录</div>
            <div className="mt-0.5 text-[18px] font-black text-on-surface">{selected.length}</div>
          </div>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 gap-0 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-h-0 overflow-auto px-5 py-4">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <div className="text-[13px] font-bold text-on-surface">可选目标目录</div>
              <p className="mt-1 text-[12px] text-ui-muted">这里只显示根目录级别的现有目录。确认后会向下探索它们的子目录结构。</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSelected(rootDirectoryOptions)}
                className="rounded-[8px] border border-on-surface/8 bg-surface px-3 py-1.5 text-[12px] font-bold text-on-surface transition-colors hover:border-primary/20 hover:text-primary"
              >
                全选目录
              </button>
              <button
                type="button"
                onClick={() => setSelected([])}
                className="rounded-[8px] border border-on-surface/8 bg-surface px-3 py-1.5 text-[12px] font-bold text-on-surface transition-colors hover:border-primary/20 hover:text-primary"
              >
                清空
              </button>
            </div>
          </div>

          <div className="space-y-2">
            {rootDirectoryOptions.length > 0 ? rootDirectoryOptions.map((path) => {
              const checked = selectedSet.has(path);
              const itemCount = rootEntries.filter((entry) => normalizePath(entry.source_relpath).startsWith(path)).length;
              return (
                <label
                  key={path}
                  className={cn(
                    "flex cursor-pointer items-start gap-3 rounded-[10px] border px-4 py-3 transition-colors",
                    checked
                      ? "border-primary/22 bg-primary/[0.04]"
                      : "border-on-surface/8 bg-surface hover:border-primary/20 hover:bg-primary/[0.02]",
                  )}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(event) => {
                      setSelected((prev) => {
                        if (event.target.checked) {
                          return [...prev, path];
                        }
                        return prev.filter((value) => value !== path);
                      });
                    }}
                    className="mt-1 h-4 w-4 rounded border-on-surface/20 text-primary focus:ring-primary/30"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-[14px] font-bold text-on-surface">{path}</span>
                      <span className="rounded-full border border-on-surface/8 bg-surface-container-low px-2 py-0.5 text-[10px] font-bold text-ui-muted">
                        目标目录
                      </span>
                    </div>
                    <div className="mt-1 text-[11px] leading-5 text-ui-muted">
                      确认后会深度探索其子目录结构，供模型归类时参考。
                    </div>
                    <div className="mt-2 text-[11px] font-medium text-ui-muted">
                      根级条目标签数：{itemCount}
                    </div>
                  </div>
                </label>
              );
            }) : (
              <div className="rounded-[10px] border border-warning/16 bg-warning-container/12 px-4 py-3 text-[12px] leading-6 text-warning">
                当前根目录下没有可用的现有目录。此时不适合使用“归入已有目录”，建议改用“整理整个目录”。
              </div>
            )}
          </div>
        </div>

        <aside className="border-l border-on-surface/8 bg-surface px-5 py-4">
          <div className="rounded-[10px] border border-on-surface/8 bg-surface-container-lowest p-4">
            <div className="flex items-center gap-2 text-[13px] font-bold text-on-surface">
              <ArrowRightLeft className="h-4 w-4 text-primary" />
              本轮逻辑
            </div>
            <div className="mt-3 space-y-3 text-[12px] leading-6 text-ui-muted">
              <p>已选目录会被视为“目标池”。</p>
              <p>未选中的根级目录，以及根目录散落的文件，会进入待整理扫描范围。</p>
              <p>如果这些目标目录都不合适，后续仍然可以创建新的顶级目录。</p>
            </div>
            <button
              type="button"
              onClick={() => onConfirm(selected)}
              disabled={loading || selected.length === 0}
              className="mt-4 inline-flex w-full items-center justify-center rounded-[8px] bg-primary px-4 py-2.5 text-[13px] font-bold text-white shadow-sm transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? "正在扫描待整理项..." : "确认目标目录并继续"}
            </button>
          </div>

          <div className="mt-4 rounded-[10px] border border-on-surface/8 bg-surface-container-lowest p-4">
            <div className="flex items-center gap-2 text-[13px] font-bold text-on-surface">
              <ScanSearch className="h-4 w-4 text-primary" />
              将进入待整理范围
            </div>
            <p className="mt-2 text-[12px] leading-6 text-ui-muted">
              共 {pendingEntries.length} 个根级条目。确认后，系统会只扫描并规划这些内容。
            </p>
            <div className="mt-3 max-h-[360px] space-y-2 overflow-auto pr-1">
              {pendingEntries.length > 0 ? pendingEntries.map((entry) => {
                const relpath = normalizePath(entry.source_relpath);
                const isDirectory = ["dir", "directory", "folder"].includes(String(entry.entry_type || "").toLowerCase());
                return (
                  <div key={relpath} className="rounded-[8px] border border-on-surface/8 bg-surface px-3 py-2">
                    <div className="flex items-center gap-2">
                      {isDirectory ? <FolderTree className="h-3.5 w-3.5 text-primary" /> : <Inbox className="h-3.5 w-3.5 text-primary" />}
                      <span className="truncate text-[12px] font-semibold text-on-surface">{entry.display_name}</span>
                    </div>
                    <div className="mt-1 truncate font-mono text-[11px] text-ui-muted">{relpath}</div>
                  </div>
                );
              }) : (
                <div className="rounded-[8px] border border-success/16 bg-success/8 px-3 py-2 text-[12px] text-success-dim">
                  当前没有待整理项。全部根级条目都会被视为目标目录。
                </div>
              )}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
