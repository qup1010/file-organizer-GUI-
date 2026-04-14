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
    onLocateIssue?: (itemIds: string[], filter?: "unresolved" | "review" | "invalidated" | "changed") => void;
}

function reviewMoveCount(summary: PrecheckSummary) {
    return (summary.move_preview || []).filter((move) =>
        (move.target || "").split(/[\\/]/).some((part) => part.toLowerCase() === "review"),
    ).length;
}

export function PrecheckView({ summary, isBusy, readOnly = false, onRequestExecute, onBack, onLocateIssue }: PrecheckViewProps) {
    const [filter, setFilter] = useState<DirectoryTreeFilter>("all");

    if (!summary) {
        return (
            <div className="flex h-full w-full items-center justify-center p-10 text-center">
                <div className="space-y-4">
                    <div className="h-10 w-10 animate-spin rounded-full border-2 border-primary border-t-transparent mx-auto" />
                    <p className="text-[14px] text-ui-muted">正在准备预检报告...</p>
                </div>
            </div>
        );
    }

    const hasErrors = (summary.blocking_errors || []).length > 0;
    const hasWarnings = (summary.warnings || []).length > 0;
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
        leafEntries: (summary.move_preview || []).map((move) => ({ path: move.source })),
        emptyLabel: "当前没有可预检的原始路径。",
    };

    const afterTree = {
        title: "整理后目录树",
        subtitle: "这里是预检完成后即将形成的目标结构。",
        leafEntries: (summary.move_preview || []).map<DirectoryTreeLeafEntry>((move) => ({
            path: move.target,
            status: (move.target || "").split(/[\\/]/).some((part) => part.toLowerCase() === "review") ? "review" : "pending",
        })),
        directoryEntries: summary.mkdir_preview || [],
        emptyLabel: filter === "review" ? "没有发现被归类到 Review 路径的文件。" : "当前没有可展示的目标目录结构。",
    };

    return (
        <div className="mx-auto flex h-full w-full max-w-[1360px] flex-col overflow-hidden px-4 py-5 lg:px-6 @container">
            <div className="shrink-0 space-y-4">
            <section className="overflow-hidden rounded-[8px] border border-on-surface/8 bg-surface-container-lowest shadow-[0_12px_44px_rgba(0,0,0,0.06)]">
                {/* Header Section - Desktop Native */}
                <div className="relative overflow-hidden border-b border-on-surface/6 bg-on-surface/[0.015] px-5 py-4 lg:px-6">
                    <div className="flex items-start justify-between gap-4">
                        <div className="space-y-0.5">
                            <div className="flex items-center gap-2">
                                <div className={cn("flex h-6 w-6 items-center justify-center rounded-[4px]", summaryTone === "danger" ? "bg-error/10 text-error" : summaryTone === "warning" ? "bg-warning/10 text-warning" : "bg-success/10 text-success-dim")}>
                                    {summaryTone === "danger" ? <ShieldAlert className="h-3.5 w-3.5" /> : summaryTone === "warning" ? <AlertCircle className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                                </div>
                                <h2 className="font-headline text-[14px] font-bold tracking-tight text-on-surface">
                                    {statusTitle}
                                </h2>
                            </div>
                            <p className="text-[11.5px] leading-relaxed text-ui-muted pl-8">
                                {statusDescription} 已确保操作符合结构安全契约。
                            </p>
                        </div>
                    </div>
                </div>

                {/* Metrics Stats - Compact Horizontal Line */}
                <div className="flex flex-wrap items-center gap-6 border-b border-on-surface/4 bg-surface-container-lowest px-5 py-2.5 lg:px-6">
                    {/* Move Items Stat */}
                    <div className="flex items-center gap-2.5">
                        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[4px] bg-primary/6 text-primary">
                            <ArrowRight className="h-3.5 w-3.5 rotate-[-45deg]" />
                        </div>
                        <div className="flex items-baseline gap-1.5">
                            <span className="font-headline text-[14px] font-bold tracking-tight text-on-surface leading-none">{summary.move_preview.length}</span>
                            <span className="text-[10px] font-medium text-ui-muted opacity-80">项移送</span>
                        </div>
                    </div>

                    <div className="h-3.5 w-px bg-on-surface/10" />

                    {/* New Folders Stat */}
                    <div className="flex items-center gap-2.5">
                        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[4px] bg-sky-500/8 text-sky-600">
                            <FolderPlus className="h-3.5 w-3.5" />
                        </div>
                        <div className="flex items-baseline gap-1.5">
                            <span className="font-headline text-[14px] font-bold tracking-tight text-on-surface leading-none">{summary.mkdir_preview.length}</span>
                            <span className="text-[10px] font-medium text-ui-muted opacity-80">新建目录</span>
                        </div>
                    </div>

                    <div className="h-3.5 w-px bg-on-surface/10" />

                    {/* Risks Stat */}
                    <div className="flex items-center gap-2.5">
                        <div className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-[4px]", reviewCount > 0 ? "bg-warning/15 text-warning" : "bg-success/8 text-success-dim")}>
                            {reviewCount > 0 ? <AlertCircle className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                        </div>
                        <div className="flex items-baseline gap-1.5">
                            <span className={cn("font-headline text-[14px] font-bold tracking-tight leading-none", reviewCount > 0 ? "text-warning" : "text-on-surface")}>{reviewCount}</span>
                            <span className="text-[10px] font-medium text-ui-muted opacity-80">需核实风险</span>
                        </div>
                    </div>
                </div>

                {/* Footer Info / Safety Guarantee */}
                <div className="bg-on-surface/[0.02] px-5 py-2.5 flex flex-wrap items-center justify-between gap-3 lg:px-6">
                    <div className="flex items-center gap-2">
                        <ShieldAlert className="h-3 w-3 text-primary/60" />
                        <span className="text-[10.5px] font-semibold text-ui-muted">
                            已启用系统保护：修改会在写入前生成全量记录
                        </span>
                    </div>
                    {reviewCount > 0 && (
                        <p className="text-[10px] text-warning/80 font-bold tracking-tight">
                            * 建议执行前核对右侧 Review 目录项
                        </p>
                    )}
                </div>
            </section>
            </div>

            <div className="mt-3 flex-1 min-h-0 flex flex-col gap-3 pr-1">
                <section className="flex-1 flex flex-col min-h-0 overflow-hidden rounded-[8px] border border-on-surface/8 bg-surface-container-lowest shadow-[0_4px_16px_rgba(0,0,0,0.02)]">
                <div className="shrink-0 flex items-center justify-between border-b border-on-surface/6 bg-on-surface/[0.01] px-4 py-2">
                    <h3 className="text-[12.5px] font-bold font-headline text-on-surface">执行前后结构变化</h3>
                    {reviewCount > 0 && (
                        <div className="flex items-center gap-0.5 rounded-[4px] border border-on-surface/8 bg-surface p-0.5 shadow-sm">
                            {[
                                { id: "all", label: "全部" },
                                { id: "review", label: `风险 (${reviewCount})` },
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
                    )}
                </div>
                <div className="flex-1 overflow-y-auto min-h-0 bg-surface">
                  <DirectoryTreeDiff before={beforeTree} after={afterTree} filter={filter} />
                </div>
            </section>

            {(hasErrors || hasWarnings || reviewCount > 0) ? (
                <section className="shrink-0 max-h-[35%] overflow-y-auto space-y-3 rounded-[6px] border border-on-surface/8 bg-surface px-5 py-4 shadow-[0_4px_12px_rgba(0,0,0,0.02)] scrollbar-thin">
                    <div className="flex items-center gap-3">
                        <ShieldAlert className="h-5 w-5 text-on-surface/40" />
                        <h3 className="text-[16px] font-bold font-headline tracking-tight text-on-surface">预检详情与异常</h3>
                    </div>

                    {(summary.issues?.length ? summary.issues : []).map((issue) => {
                        const isBlocking = issue.severity === "blocking";
                        const isWarning = issue.severity === "warning";
                        const tone = isBlocking ? "border-error/15" : isWarning ? "border-warning/15" : "border-primary/15";
                        const Icon = isBlocking ? AlertCircle : isWarning ? ShieldAlert : FolderPlus;
                        const title = isBlocking ? "必须先处理" : isWarning ? "建议执行前确认" : "Review（待核对）提醒";
                        const locateFilter = issue.severity === "review" ? "review" : issue.severity === "blocking" ? "changed" : "changed";
                        return (
                            <div key={issue.id} className={cn("flex items-start justify-between gap-4 rounded-[4px] bg-surface-container-lowest px-4 py-4", tone)}>
                                <div className="flex items-start gap-3">
                                    <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", isBlocking ? "text-error" : isWarning ? "text-warning" : "text-primary")} />
                                    <div>
                                        <p className="text-[14px] font-semibold text-on-surface">{title}</p>
                                        <p className="mt-1 text-[13px] leading-6 text-ui-muted">{issue.message}</p>
                                    </div>
                                </div>
                                {onLocateIssue && issue.related_item_ids?.length ? (
                                    <button
                                        type="button"
                                        onClick={() => onLocateIssue(issue.related_item_ids, locateFilter)}
                                        className="shrink-0 rounded-[6px] border border-on-surface/8 bg-surface px-3 py-1.5 text-[12px] font-semibold text-on-surface"
                                    >
                                        定位到相关条目
                                    </button>
                                ) : null}
                            </div>
                        );
                    })}
                </section>
            ) : null}
            </div>

            <div className="mt-3 shrink-0">

            <section className="rounded-[8px] border border-primary/10 bg-primary/[0.03] px-5 py-3.5 shadow-sm">
                <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[6px] bg-primary text-white shadow-sm">
                            <ListChecks className="h-4 w-4" />
                        </div>
                        <div>
                            <h4 className="text-[13.5px] font-bold text-on-surface leading-tight">{readOnly ? "系统预检快照" : "确认部署本次整理？"}</h4>
                            <p className="mt-0.5 text-[11px] text-ui-muted">
                                {readOnly
                                    ? "当前运行处于追溯模式，仅供查看过去的状态。"
                                    : "执行不可逆，若发现异常可去「历史记录」内手动回退"}
                            </p>
                        </div>
                    </div>

                    {!readOnly ? (
                        <div className="flex shrink-0 items-center gap-2">
                            <button
                                type="button"
                                onClick={onBack}
                                disabled={isBusy}
                                className="inline-flex h-8 items-center justify-center rounded-[4px] border border-on-surface/10 bg-surface px-4 text-[12px] font-bold text-on-surface-variant transition-colors hover:bg-on-surface/5 active:scale-95 disabled:opacity-50"
                            >
                                取消
                            </button>
                            <button
                                type="button"
                                onClick={onRequestExecute}
                                disabled={isBusy || hasErrors}
                                className="inline-flex h-8 items-center justify-center gap-1.5 rounded-[4px] bg-primary px-5 text-[12px] font-bold text-white transition-all hover:bg-primary/90 active:scale-95 disabled:opacity-50"
                            >
                                <ArrowRight className="h-3.5 w-3.5" />
                                立即执行
                            </button>
                        </div>
                    ) : null}
                </div>
            </section>
            </div>
        </div>
    );
}
