"use client";

import { AlertCircle, ArrowRight, CheckCircle2, FolderPlus, ListChecks, ShieldAlert } from "lucide-react";
import { PrecheckSummary } from "@/types/session";
import { cn } from "@/lib/utils";
import { DirectoryTreeDiff, type DirectoryTreeLeafEntry, type DirectoryTreeFilter } from "./directory-tree-diff";
import { useState } from "react";

interface PrecheckViewProps {
    summary: PrecheckSummary | null;
    isBusy: boolean;
    readOnly?: boolean;
    onRequestExecute: () => void;
    onBack: () => void;
}

function reviewMoveCount(summary: PrecheckSummary) {
    return summary.move_preview.filter((move) =>
        move.target.split(/[\\/]/).some((part) => part.toLowerCase() === "review"),
    ).length;
}

export function PrecheckView({ summary, isBusy, readOnly = false, onRequestExecute, onBack }: PrecheckViewProps) {
    const [filter, setFilter] = useState<DirectoryTreeFilter>("all");

    if (!summary) {
        return null;
    }

    const hasErrors = summary.blocking_errors.length > 0;
    const hasWarnings = summary.warnings.length > 0;
    const reviewCount = reviewMoveCount(summary);
    const summaryTone = hasErrors ? "danger" : hasWarnings ? "warning" : "success";

    const statusTitle = hasErrors
        ? "当前不能执行"
        : hasWarnings
            ? "可执行，但建议先看提醒"
            : "方案预检通过";
    const statusDescription = hasErrors
        ? "预检发现了必须先处理的问题，先修复后再执行会更安全。"
        : hasWarnings
            ? "结构已经通过，但还有一些风险提醒值得先确认。"
            : "结构检查已经通过，一切就绪，可以进入执行阶段。";

    const beforeTree = {
        title: "整理前目录树",
        subtitle: "这里是这次会参与整理的原始位置。",
        leafEntries: summary.move_preview.map((move) => ({ path: move.source })),
        emptyLabel: "当前没有可预检的原始路径。",
    };

    const afterTree = {
        title: "整理后目录树",
        subtitle: "这里是预检完成后即将形成的目标结构。",
        leafEntries: summary.move_preview.map<DirectoryTreeLeafEntry>((move) => ({
            path: move.target,
            status: move.target.split(/[\\/]/).some((part) => part.toLowerCase() === "review") ? "review" : "pending",
        })),
        directoryEntries: summary.mkdir_preview,
        emptyLabel: filter === "review" ? "没有发现被归类到 Review 路径的文件。" : "当前没有可展示的目标目录结构。",
    };

    return (
        <div className="mx-auto max-w-[1360px] space-y-4 py-5">
            <section className="overflow-hidden rounded-[8px] border border-on-surface/8 bg-surface-container-lowest shadow-[0_12px_44px_rgba(0,0,0,0.06)]">
                {/* Header Section - Refined and Focused */}
                <div className="relative overflow-hidden border-b border-on-surface/4 bg-on-surface/[0.01] px-6 py-6 lg:px-8">
                    <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-primary/2 blur-[80px]" />
                    
                    <div className="relative flex flex-col gap-4">
                        <div className="flex items-center justify-between">
                            <div className="inline-flex items-center gap-2 rounded-full border border-primary/10 bg-primary/5 px-3 py-1 text-[9px] font-black uppercase tracking-[0.2em] text-primary/70">
                                <ListChecks className="h-3 w-3" />
                                Execution Precheck
                            </div>
                            <div className="flex gap-1.5">
                                {!hasErrors && !hasWarnings ? (
                                    <span className="flex items-center gap-1.5 rounded-full bg-emerald-500/8 px-2.5 py-0.5 text-[10px] font-black tracking-tight text-emerald-600/80">
                                        <CheckCircle2 className="h-3 w-3" /> 指标正常
                                    </span>
                                ) : (
                                    <>
                                        {hasErrors && (
                                            <span className="flex items-center gap-1.5 rounded-full bg-error/8 px-2.5 py-0.5 text-[10px] font-black tracking-tight text-error/80">
                                                <ShieldAlert className="h-3 w-3" /> 存在阻断
                                            </span>
                                        )}
                                        {hasWarnings && (
                                            <span className="flex items-center gap-1.5 rounded-full bg-warning/8 px-2.5 py-0.5 text-[10px] font-black tracking-tight text-warning/80">
                                                <AlertCircle className="h-3 w-3" /> 风险提醒
                                            </span>
                                        )}
                                    </>
                                )}
                            </div>
                        </div>

                        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                            <div className="space-y-1">
                                <h2 className="font-headline text-[1.4rem] font-black tracking-tight text-on-surface leading-tight">
                                    {statusTitle}
                                </h2>
                                <p className="max-w-[600px] text-[12px] leading-snug text-on-surface/40">
                                    {statusDescription} 已确保操作符合结构安全契约。
                                </p>
                            </div>

                            <div className={cn(
                                "flex items-center gap-2 rounded-[8px] border px-3 py-1.5 transition-all duration-300",
                                summaryTone === "danger"
                                    ? "border-error/10 bg-error/5 text-error"
                                    : summaryTone === "warning"
                                        ? "border-warning/20 bg-warning/5 text-warning"
                                        : "border-emerald-500/10 bg-emerald-500/5 text-emerald-600",
                            )}>
                                {summaryTone === "danger" ? (
                                    <ShieldAlert className="h-3.5 w-3.5" />
                                ) : summaryTone === "warning" ? (
                                    <AlertCircle className="h-3.5 w-3.5" />
                                ) : (
                                    <CheckCircle2 className="h-3.5 w-3.5" />
                                )}
                                <span className="text-[12px] font-black tracking-tight">{statusTitle}</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Metrics Stats - Refined and Exquisite */}
                <div className="grid grid-cols-1 divide-y divide-on-surface/4 border-b border-on-surface/4 md:grid-cols-3 md:divide-x md:divide-y-0">
                    {/* Move Items Stat */}
                    <div className="group relative bg-on-surface/[0.01] px-6 py-5 transition-colors hover:bg-on-surface/[0.02] lg:px-8">
                        <div className="flex items-center gap-4">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[6px] bg-primary/6 text-primary group-hover:scale-105 transition-transform">
                                <ArrowRight className="h-5 w-5 rotate-[-45deg]" />
                            </div>
                            <div className="min-w-0 flex-1">
                                <p className="truncate text-[10px] font-black uppercase tracking-widest text-on-surface/30">拟移动条目</p>
                                <div className="mt-0.5 flex items-baseline gap-1.5">
                                    <span className="font-headline text-[1.6rem] font-black tracking-tight text-on-surface leading-none">
                                        {summary.move_preview.length}
                                    </span>
                                    <span className="text-[11px] font-bold text-on-surface/40">项</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* New Folders Stat */}
                    <div className="group relative bg-on-surface/[0.01] px-6 py-5 transition-colors hover:bg-on-surface/[0.02] lg:px-8">
                        <div className="flex items-center gap-4">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[6px] bg-sky-500/8 text-sky-600 group-hover:scale-105 transition-transform">
                                <FolderPlus className="h-5 w-5" />
                            </div>
                            <div className="min-w-0 flex-1">
                                <p className="truncate text-[10px] font-black uppercase tracking-widest text-on-surface/30">拟新建目录</p>
                                <div className="mt-0.5 flex items-baseline gap-1.5">
                                    <span className="font-headline text-[1.6rem] font-black tracking-tight text-on-surface leading-none">
                                        {summary.mkdir_preview.length}
                                    </span>
                                    <span className="text-[11px] font-bold text-on-surface/40">个</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Risks Stat */}
                    <div className={cn(
                        "group relative px-6 py-5 transition-colors lg:px-8",
                        reviewCount > 0 ? "bg-warning/4 hover:bg-warning/8" : "bg-on-surface/[0.01] hover:bg-on-surface/[0.02]"
                    )}>
                        <div className="flex items-center gap-4">
                            <div className={cn(
                                "flex h-10 w-10 shrink-0 items-center justify-center rounded-[6px] group-hover:scale-105 transition-transform",
                                reviewCount > 0 ? "bg-warning/15 text-warning" : "bg-emerald-500/8 text-emerald-600"
                            )}>
                                {reviewCount > 0 ? <AlertCircle className="h-5 w-5" /> : <CheckCircle2 className="h-5 w-5" />}
                            </div>
                            <div className="min-w-0 flex-1">
                                <p className={cn(
                                    "truncate text-[10px] font-black uppercase tracking-widest",
                                    reviewCount > 0 ? "text-warning/80" : "text-on-surface/30"
                                )}>需核实风险</p>
                                <div className="mt-0.5 flex items-baseline gap-1.5">
                                    <span className={cn(
                                        "font-headline text-[1.6rem] font-black tracking-tight leading-none",
                                        reviewCount > 0 ? "text-warning" : "text-on-surface"
                                    )}>
                                        {reviewCount}
                                    </span>
                                    <span className="text-[11px] font-bold text-on-surface/40">项</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Footer Info / Safety Guarantee */}
                <div className="bg-on-surface/[0.02] px-6 py-3 flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-2.5">
                        <ShieldAlert className="h-3.5 w-3.5 text-primary/60" />
                        <span className="text-[11px] font-bold text-on-surface/45">
                            已启用执行保护：支持回退记录和执行前预检
                        </span>
                    </div>
                    {reviewCount > 0 && (
                        <p className="text-[11px] text-warning/80 font-bold tracking-tight">
                            * 建议执行前检查右侧 `Review` 文件夹内容
                        </p>
                    )}
                </div>
            </section>



            <section className="space-y-4 rounded-[6px] border border-on-surface/8 bg-surface-container-lowest p-5 shadow-[0_12px_44px_rgba(0,0,0,0.04)]">
                <div className="flex flex-col gap-3 border-b border-on-surface/8 pb-4 lg:flex-row lg:items-end lg:justify-between">
                    <div className="space-y-1">
                        <p className="text-[11px] font-bold uppercase tracking-widest text-ui-muted opacity-45">结构对比</p>
                        <h3 className="text-[16px] font-bold font-headline tracking-tight text-on-surface">执行前后目录变化</h3>
                    </div>
                    {reviewCount > 0 && (
                        <div className="flex items-center gap-1.5 rounded-[4px] border border-on-surface/8 bg-on-surface/[0.03] p-1">
                            {[
                                { id: "all", label: "全部目录" },
                                { id: "review", label: `待处理 (${reviewCount})` },
                            ].map((btn) => (
                                <button
                                    key={btn.id}
                                    onClick={() => setFilter(btn.id as DirectoryTreeFilter)}
                                    className={cn(
                                        "rounded-[4px] px-5 py-2.2 text-[13px] font-black tracking-tight transition-all",
                                        filter === btn.id
                                            ? "bg-white text-primary shadow-sm shadow-on-surface/5"
                                            : "text-ui-muted hover:text-on-surface",
                                    )}
                                >
                                    {btn.label}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
                <DirectoryTreeDiff before={beforeTree} after={afterTree} filter={filter} />
            </section>

            {(hasErrors || hasWarnings || reviewCount > 0) ? (
                <section className="space-y-3 rounded-[6px] border border-on-surface/8 bg-surface px-5 py-5 shadow-[0_10px_28px_rgba(0,0,0,0.03)]">
                    <div className="flex items-center gap-3">
                        <ShieldAlert className="h-5 w-5 text-on-surface/40" />
                        <h3 className="text-[16px] font-bold font-headline tracking-tight text-on-surface">预检详情与异常</h3>
                    </div>

                    {summary.blocking_errors.map((err, index) => (
                        <div key={`${err}-${index}`} className="flex items-start gap-3 rounded-[4px] border border-error/15 bg-surface-container-lowest px-4 py-4">
                            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-error" />
                            <div>
                                <p className="text-[14px] font-semibold text-on-surface">必须先处理</p>
                                <p className="mt-1 text-[13px] leading-6 text-ui-muted">{err}</p>
                            </div>
                        </div>
                    ))}

                    {summary.warnings.map((warn, index) => (
                        <div key={`${warn}-${index}`} className="flex items-start gap-3 rounded-[4px] border border-warning/15 bg-surface-container-lowest px-4 py-4">
                            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                            <div>
                                <p className="text-[14px] font-semibold text-on-surface">建议执行前确认</p>
                                <p className="mt-1 text-[13px] leading-6 text-ui-muted">{warn}</p>
                            </div>
                        </div>
                    ))}

                    {reviewCount > 0 ? (
                        <div className="flex items-start gap-3 rounded-[4px] border border-primary/15 bg-surface-container-lowest px-4 py-4">
                            <FolderPlus className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                            <div>
                                <p className="text-[14px] font-semibold text-on-surface">Review 提醒</p>
                                <p className="mt-1 text-[13px] leading-6 text-ui-muted">
                                    这次有 {reviewCount} 项会先进入 `Review`。这些条目会先保留在待确认区域，之后仍可继续整理或重新归类。
                                </p>
                            </div>
                        </div>
                    ) : null}
                </section>
            ) : null}

            <section className="rounded-[8px] border border-primary/15 bg-primary/5 p-6 shadow-[0_20px_48px_rgba(var(--primary-rgb),0.08)]">
                <div className="flex items-start gap-5">
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[6px] bg-primary text-white shadow-[0_10px_25px_rgba(var(--primary-rgb),0.3)]">
                        <ListChecks className="h-7 w-7" />
                    </div>
                    <div>
                        <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-primary/70">最后确认</p>
                        <h4 className="mt-1 text-[1.25rem] font-black font-headline tracking-tight text-on-surface">{readOnly ? "这是预检快照" : "确认执行这次整理？"}</h4>
                        <p className="mt-1.5 text-[14px] leading-relaxed text-on-surface/60 max-w-3xl">
                            {readOnly
                                ? "当前处于历史回放模式，预检快照仅用于追溯执行前的系统状态。"
                                : "执行后，文件会按预览结构真实移动。若结果不符合预期，你之后仍可在“整理历史”中回退这次执行。"}
                        </p>
                    </div>
                </div>

                {!readOnly ? (
                    <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                        <button
                            type="button"
                            onClick={onBack}
                            disabled={isBusy}
                            className="inline-flex items-center justify-center rounded-[4px] border border-on-surface/10 bg-white px-8 py-3.5 text-[14px] font-black text-on-surface/70 transition-all hover:bg-on-surface/[0.02] hover:text-on-surface hover:shadow-md active:scale-95 disabled:opacity-40"
                        >
                            返回修改方案
                        </button>
                        <button
                            type="button"
                            onClick={onRequestExecute}
                            disabled={isBusy || hasErrors}
                            className="inline-flex flex-1 items-center justify-center gap-3 rounded-[4px] bg-primary px-8 py-3.5 text-[15px] font-black text-white transition-all hover:bg-primary/90 hover:shadow-[0_12px_32px_rgba(var(--primary-rgb),0.25)] active:scale-[0.98] disabled:opacity-30"
                        >
                            <ArrowRight className="h-5 w-5" />
                            确认并执行整理
                        </button>
                    </div>
                ) : null}
            </section>
        </div>
    );
}
