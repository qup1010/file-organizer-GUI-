"use client";
import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Loader2, 
  StopCircle, 
  Search, 
  FileText, 
  Activity,
  AlertCircle,
  Archive,
  Layers,
  Sparkles,
  RefreshCw,
  FileIcon,
  FileType,
  Image as ImageIcon,
  Film,
  Folder,
  Music,
  FileJson,
  FileCode,
  Box,
  Binary,
} from "lucide-react";
import Link from "next/link";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

import { ScannerProgress } from "@/types/session";
import { Button } from "@/components/ui/button";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

type PipelineStepState = "active" | "done" | "pending" | "aborted";

interface PipelineStep {
  id: string;
  title: string;
  detail: string;
  state: PipelineStepState;
  icon: React.ComponentType<{ className?: string }>;
}

const GENERIC_SCAN_ITEMS = new Set([
  "当前目录",
  "正在准备扫描任务",
  "正在等待模型响应",
  "正在读取目录...",
]);

function isSpecificScanItem(value: string | null | undefined): boolean {
  const text = String(value || "").trim();
  if (!text || GENERIC_SCAN_ITEMS.has(text)) {
    return false;
  }
  return !text.startsWith("已启动 ") && !text.startsWith("第 ");
}

function getFileIcon(filename: string, entryType?: string) {
  if (entryType === "dir") {
    return { icon: Folder, color: "text-amber-600", bg: "bg-amber-500/10" };
  }
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  if (["jpg", "jpeg", "png", "gif", "webp", "svg", "bmp"].includes(ext)) {
    return { icon: ImageIcon, color: "text-purple-500", bg: "bg-purple-500/10" };
  }
  if (["mp4", "mkv", "avi", "mov", "wmv"].includes(ext)) {
    return { icon: Film, color: "text-blue-500", bg: "bg-blue-500/10" };
  }
  if (["mp3", "wav", "flac", "aac"].includes(ext)) {
    return { icon: Music, color: "text-pink-500", bg: "bg-pink-500/10" };
  }
  if (["zip", "rar", "7z", "tar", "gz"].includes(ext)) {
    return { icon: Archive, color: "text-amber-600", bg: "bg-amber-600/10" };
  }
  if (["pdf"].includes(ext)) {
    return { icon: FileText, color: "text-red-500", bg: "bg-red-500/10" };
  }
  if (["doc", "docx", "txt", "md", "rtf"].includes(ext)) {
    return { icon: FileLinesIcon, color: "text-blue-600", bg: "bg-blue-600/10" };
  }
  if (["js", "ts", "tsx", "jsx", "py", "go", "rs", "cpp", "c", "h", "java", "html", "css"].includes(ext)) {
    return { icon: FileCode, color: "text-emerald-500", bg: "bg-emerald-500/10" };
  }
  if (["json", "yaml", "yml", "xml"].includes(ext)) {
    return { icon: FileJson, color: "text-orange-500", bg: "bg-orange-500/10" };
  }
  if (["exe", "msi", "bin", "dll"].includes(ext)) {
    return { icon: Binary, color: "text-slate-500", bg: "bg-slate-500/10" };
  }
  return { icon: FileIcon, color: "text-on-surface-variant/40", bg: "bg-on-surface/5" };
}

const FileLinesIcon = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/></svg>
);

function derivePipelineSteps(scanner: ScannerProgress): PipelineStep[] {
  const message = String(scanner.message || "").trim();
  const currentItem = String(scanner.current_item || "").trim();
  const totalCount = Math.max(0, Number(scanner.total_count || 0));
  const processedCount = Math.max(0, Number(scanner.processed_count || 0));
  const recentCount = (scanner.recent_analysis_items || []).length;
  const batchCount = Math.max(0, Number(scanner.batch_count || 0));
  const completedBatches = Math.max(0, Number(scanner.completed_batches || 0));
  const isRetrying = Boolean(scanner.is_retrying);
  const isThinking = Boolean(scanner.ai_thinking);
  const status = String(scanner.status || "running");
  
  const hasSpecificItem = isSpecificScanItem(currentItem);
  const isCompleted = status === "completed";
  const isAborted = status === "failed" || status === "interrupted" || status === "cancelled";

  // Step 1: Prepare
  const isPrepareDone = totalCount > 0 || isCompleted;
  
  // Step 2: Read structure
  const isReadStructureDone = totalCount > 0 || isCompleted;
  
  // Step 3: Analyze
  const isAnalyzeActive = !isCompleted && !isAborted && isReadStructureDone;
  const isAnalyzeDone = isCompleted;

  const analysisTitle = batchCount > 0 ? "并行内容分析" : "读取与分析";
  let analysisDetail = "等待开始";
  if (isCompleted) {
    analysisDetail = `已完成分析 ${processedCount} 项`;
  } else if (batchCount > 0) {
    analysisDetail = `处理中 (批次进度: ${completedBatches}/${batchCount})`;
  } else if (hasSpecificItem) {
    analysisDetail = `当前正在处理：${currentItem}`;
  } else if (processedCount > 0) {
    analysisDetail = `已处理 ${processedCount}/${totalCount} 项`;
  } else if (isThinking) {
    analysisDetail = `正在分析目录内容...`;
  }

  // Step 4: Summarize
  const isSummarizeDone = isCompleted && !isRetrying;
  const isSummarizeActive = !isAborted && (isRetrying || (!isCompleted && message.includes("结果需要修正")));

  return [
    {
      id: "prepare",
      title: "建立扫描任务",
      detail: totalCount > 0 ? `发现 ${totalCount} 个待分析项` : "正在确认目录范围",
      state: isPrepareDone ? "done" : isAborted ? "aborted" : "active",
      icon: Search,
    },
    {
      id: "read-structure",
      title: "读取目录索引",
      detail: isReadStructureDone ? "已提取文件列表" : "正在梳理文件关联",
      state: isReadStructureDone ? "done" : isAborted && isPrepareDone ? "aborted" : isPrepareDone ? "active" : "pending",
      icon: Layers,
    },
    {
      id: "analyze",
      title: analysisTitle,
      detail: analysisDetail,
      state: isAnalyzeDone ? "done" : isAborted && isReadStructureDone ? "aborted" : isAnalyzeActive ? "active" : "pending",
      icon: FileText,
    },
    {
      id: "summarize",
      title: isRetrying ? "重新校验格式" : "整理分析结论",
      detail: isRetrying
        ? (message || "正在尝试纠正模型输出")
        : isSummarizeDone
          ? "已生成最终报告"
          : "等待汇总整体结果",
      state: isSummarizeDone ? "done" : isAborted && isAnalyzeDone ? "aborted" : isSummarizeActive ? "active" : "pending",
      icon: isRetrying ? RefreshCw : Sparkles,
    },
  ];
}

interface MinimalScanningViewProps {
  scanner: ScannerProgress;
  progressPercent: number;
  onAbort?: () => void;
  aborting?: boolean;
  isModelConfigured?: boolean;
}

export function MinimalScanningView({ 
  scanner, 
  progressPercent, 
  onAbort, 
  aborting = false,
  isModelConfigured = true 
}: MinimalScanningViewProps) {
  const currentItem = scanner.current_item || "正在读取目录...";
  const recentItems = scanner.recent_analysis_items || [];
  const isRetrying = scanner.is_retrying;
  const isThinking = scanner.ai_thinking;
  const totalCount = Math.max(0, Number(scanner.total_count || 0));
  const processedCount = Math.max(0, Number(scanner.processed_count || 0));
  
  const pipelineSteps = React.useMemo(() => derivePipelineSteps(scanner), [scanner]);
  const hasLiveItems = recentItems.length > 0 || isThinking;

  // Elapsed time logic
  const [startTime] = React.useState(Date.now());
  const [elapsed, setElapsed] = React.useState(0);

  React.useEffect(() => {
    if (scanner.status === "completed") return;
    const timer = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, [startTime, scanner.status]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <div className="flex h-full flex-col overflow-hidden bg-transparent">
      <div className="flex-1 overflow-y-auto p-4 lg:p-6 scrollbar-thin">
        <motion.div
          initial={{ opacity: 0, scale: 0.99 }}
          animate={{ opacity: 1, scale: 1 }}
          className="mx-auto max-w-[1360px] space-y-4"
        >
          {!isModelConfigured && (
            <div className="flex items-center justify-between gap-4 rounded-[12px] border border-warning/20 bg-warning-container/20 p-4 backdrop-blur-md">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-warning/15 text-warning">
                  <AlertCircle className="h-5 w-5" />
                </div>
                <div className="space-y-0.5">
                  <p className="text-[14px] font-black text-on-surface">AI 文本模型未配置</p>
                  <p className="text-[12px] font-medium text-ui-muted">未配置模型将无法分析文件具体用途，建议前往“设置”页面完成配置。</p>
                </div>
              </div>
              <Link href="/settings">
                <Button variant="secondary" size="sm" className="whitespace-nowrap px-4 font-bold rounded-[8px]">
                  去配置模型
                </Button>
              </Link>
            </div>
          )}

          {/* 统一外壳容器 */}
          <div className="flex flex-col rounded-[12px] border border-on-surface/8 bg-surface-container-lowest shadow-sm overflow-hidden min-w-0 relative">
            {/* 后台进度条填充动画 */}
            <div className="absolute top-0 left-0 right-0 h-1 bg-on-surface/[0.03] z-0">
              <motion.div
                className={cn("h-full", isRetrying ? "bg-warning" : "bg-primary")}
                initial={{ width: 0 }}
                animate={{ width: `${Math.max(2, progressPercent)}%` }}
                transition={{ type: "spring", stiffness: 45, damping: 22 }}
              />
            </div>

            {/* Header: Title + Stats */}
            <div className={cn(
              "border-b border-on-surface/6 px-5 py-3.5 relative z-10 transition-all duration-500",
              isRetrying ? "bg-warning/[0.02]" : "bg-on-surface/[0.01]"
            )}>
              <div className="flex items-start justify-between gap-4 mb-4">
                <div className="space-y-0.5">
                  <h2 className="flex items-center gap-2 text-[14.5px] font-bold tracking-tight text-on-surface">
                    {isRetrying ? (
                      <RefreshCw className="h-4 w-4 text-warning animate-spin-slow" />
                    ) : (
                      <div className="relative flex items-center justify-center">
                        <Activity className="h-4 w-4 text-primary" />
                        <motion.div 
                          className="absolute inset-0 bg-primary/20 rounded-full"
                          animate={{ scale: [1, 1.6, 1], opacity: [0.3, 0, 0.3] }}
                          transition={{ duration: 2, repeat: Infinity }}
                        />
                      </div>
                    )} 
                    {isRetrying ? "正在交叉校验纠错..." : "正在深入扫描目录"}
                  </h2>
                  <p className="text-[12px] font-medium text-ui-muted opacity-70">
                    {isRetrying ? "检测到特殊文件特征，已触发深度复核。" : "分析文件特征、逻辑归属并建立建议方案。"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1.5 rounded-md border border-on-surface/8 bg-surface px-2 py-1 shadow-sm">
                    <span className="text-[10px] font-bold text-ui-muted uppercase tracking-wider opacity-50">用时</span>
                    <span className="text-[12.5px] font-mono font-bold text-on-surface">{formatTime(elapsed)}</span>
                  </div>
                  {onAbort && (
                    <button
                      onClick={onAbort}
                      disabled={aborting}
                      className="inline-flex h-7 items-center gap-1 rounded-md border border-error/20 bg-error/5 px-2 text-[10px] font-bold text-error transition-all hover:bg-error/15 disabled:opacity-50"
                    >
                      <StopCircle className="h-3 w-3" />
                      {aborting ? "中止中" : "中止"}
                    </button>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-y-3 gap-x-8 border-t border-on-surface/[0.04] pt-4">
                <div className="flex items-center gap-8">
                  <div className="flex flex-col">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-ui-muted opacity-40 leading-none mb-1">进度</span>
                    <span className="text-[16px] font-bold tabular-nums text-on-surface flex items-baseline gap-0.5">
                      {Math.round(progressPercent)}<span className="text-[11px] opacity-30">%</span>
                    </span>
                  </div>
                  <div className="h-6 w-px bg-on-surface/[0.06]" />
                  <div className="flex flex-col">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-ui-muted opacity-40 leading-none mb-1">已处理</span>
                    <span className="text-[16px] font-bold tabular-nums text-on-surface">
                      {scanner.processed_count} <span className="text-[11px] text-ui-muted font-medium opacity-25">/ {scanner.total_count}</span>
                    </span>
                  </div>
                  {scanner.batch_count ? (
                    <>
                      <div className="h-6 w-px bg-on-surface/[0.06]" />
                      <div className="flex flex-col">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-ui-muted opacity-40 leading-none mb-1">队列</span>
                        <span className="text-[16px] font-bold tabular-nums text-on-surface">
                          {scanner.completed_batches || 0} <span className="text-[11px] text-ui-muted font-medium opacity-25">/ {scanner.batch_count}</span>
                        </span>
                      </div>
                    </>
                  ) : null}
                </div>

                <div className="ml-auto flex items-center gap-2.5 rounded-lg bg-primary/[0.03] border border-primary/10 p-1 pr-3 max-w-[45%]">
                  <div className="relative flex h-7.5 w-7.5 shrink-0 items-center justify-center rounded-md bg-primary/10">
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[9px] font-bold uppercase tracking-wider text-primary/50 leading-none mb-1">正在分析</div>
                    <p className="text-[12px] font-bold text-on-surface leading-none truncate" title={currentItem}>
                      {currentItem}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Tree Section Mapped to Concurrent Log Stream */}
            <div className="flex flex-col lg:flex-row min-w-0 divide-x divide-on-surface/[0.04] bg-on-surface/[0.005]">
              <div className="flex-1 flex flex-col min-w-0">
                <div className="flex items-center justify-between px-5 py-2.5 bg-on-surface/[0.015] border-b border-on-surface/[0.04]">
                  <h3 className="flex items-center gap-2 text-[12px] font-bold text-on-surface/50">
                    <Layers className="h-3.5 w-3.5" /> 整理流水线
                  </h3>
                  
                  <div className="flex items-center gap-2 rounded-full border border-primary/10 bg-primary/5 px-2 py-0.5">
                    <span className="relative flex h-1 w-1">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary/40 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-1 w-1 bg-primary/80"></span>
                    </span>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-primary/70">状态追踪</span>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-4 scrollbar-thin max-h-[500px]">
                  <div className="grid gap-2">
                    {pipelineSteps.map((step, idx) => {
                      const Icon = step.icon;
                      const isActiveStep = step.state === "active";
                      const isDoneStep = step.state === "done";
                      const isPending = step.state === "pending";
                      const isAbortedStep = step.state === "aborted";

                      return (
                        <motion.div
                          key={step.id}
                          layout
                          initial={{ opacity: 0, x: -8 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: idx * 0.04 }}
                          className={cn(
                            "group relative flex items-center gap-3.5 rounded-[8px] border border-transparent p-2.5 transition-all duration-200",
                            isActiveStep && "border-primary/15 bg-surface shadow-sm ring-1 ring-primary/5",
                            isDoneStep && "bg-success/[0.02] border-success/5",
                            isPending && "opacity-40 grayscale-[0.2]",
                            isAbortedStep && "border-danger/10 bg-danger/5 grayscale-[0.5] opacity-80"
                          )}
                        >
                          <div className={cn(
                            "flex h-8.5 w-8.5 shrink-0 items-center justify-center rounded-md border shadow-sm transition-all duration-300",
                            isActiveStep && "border-primary/15 bg-primary/10 text-primary scale-[1.02]",
                            isDoneStep && "border-success/15 bg-success/5 text-success",
                            isPending && "border-on-surface/6 bg-surface text-on-surface-variant/30",
                            isAbortedStep && "border-danger/15 bg-danger/10 text-danger",
                          )}>
                            <Icon className={cn("h-4.5 w-4.5", isActiveStep && "animate-pulse")} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-3">
                              <p className={cn("text-[13px] font-bold tracking-tight", isActiveStep ? "text-primary" : "text-on-surface")}>{step.title}</p>
                              <div className={cn(
                                "rounded-[4px] px-1.5 py-0.5 text-[8.5px] font-bold uppercase tracking-wider border",
                                isActiveStep && "bg-primary border-primary text-white",
                                isDoneStep && "bg-success/5 border-success/15 text-success",
                                isPending && "bg-on-surface/[0.03] border-on-surface/[0.06] text-on-surface-variant/30",
                                isAbortedStep && "bg-danger/10 border-danger/20 text-danger",
                              )}>
                                {isDoneStep ? "DONE" : isActiveStep ? "RUNNING" : isAbortedStep ? "ABORTED" : "WAITING"}
                              </div>
                            </div>
                            <p className="mt-0.5 text-[11px] font-medium text-ui-muted line-clamp-1 opacity-60">
                              {step.detail}
                            </p>
                          </div>
                          {isActiveStep && (
                            <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-4 bg-primary rounded-r-full" />
                          )}
                        </motion.div>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="flex-1 flex flex-col min-w-0 bg-on-surface/[0.002]">
                <div className="flex items-center justify-between px-5 py-2.5 bg-on-surface/[0.015] border-b border-on-surface/[0.04]">
                  <h3 className="flex items-center gap-2 text-[12px] font-bold text-on-surface/50">
                    <Activity className="h-3.5 w-3.5" /> 实时分析流
                  </h3>
                </div>

                <div className="flex-1 overflow-y-auto p-4 scrollbar-thin max-h-[500px]">
                  <AnimatePresence initial={false} mode="popLayout">
                    {hasLiveItems ? (
                      <div className="space-y-1.5">
                        {isThinking && (
                          <motion.div
                            initial={{ opacity: 0, scale: 0.99 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.99 }}
                            className="p-1 space-y-1.5"
                          >
                            <div className="inline-flex items-center gap-1.5 rounded-md bg-primary/5 px-2 py-0.5 text-[10px] font-bold text-primary mb-1">
                              <Sparkles className="h-3 w-3 animate-pulse" />
                              正在预测特征
                            </div>
                            {Array.from({ length: 2 }).map((_, i) => (
                              <div key={`skeleton-${i}`} className="flex items-center gap-3 px-2.5 py-2 rounded-md border border-on-surface/[0.03] bg-surface/50 opacity-50">
                                <div className="h-7 w-7 rounded bg-on-surface/[0.05] animate-pulse" />
                                <div className="flex-1 space-y-1.5">
                                  <div className="h-2.5 w-2/3 rounded-full bg-on-surface/[0.06] animate-pulse" />
                                  <div className="h-2 w-1/2 rounded-full bg-on-surface/[0.03] animate-pulse" />
                                </div>
                              </div>
                            ))}
                          </motion.div>
                        )}

                        {recentItems.map((item, idx) => {
                          const fileMeta = getFileIcon(item.source_relpath || item.display_name, item.entry_type);
                          const CustomIcon = fileMeta.icon;
                          
                          return (
                            <motion.div
                              key={item.item_id + idx}
                              layout
                              initial={{ opacity: 0, y: 8 }}
                              animate={{ opacity: 1, y: 0 }}
                              className="group my-0.5 flex items-center gap-3 rounded-[8px] border border-on-surface/[0.04] bg-surface p-2.5 transition-all hover:border-primary/15 hover:shadow-sm"
                            >
                              <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-on-surface/[0.02] shadow-sm", fileMeta.bg)}>
                                <CustomIcon className={cn("h-4 w-4", fileMeta.color)} />
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center justify-between gap-2 mb-0.5">
                                  <span className="truncate text-[12.5px] font-bold text-on-surface group-hover:text-primary transition-colors">
                                    {item.display_name}
                                  </span>
                                  <span className="shrink-0 rounded-[4px] bg-primary/10 px-1.5 py-0.5 text-[9px] font-bold text-primary uppercase tracking-wider">
                                    {item.suggested_purpose || "ANALYZING"}
                                  </span>
                                </div>
                                <p className="truncate text-[10.5px] font-medium text-ui-muted opacity-50">
                                  {item.summary || "正在提取语义特征..."}
                                </p>
                              </div>
                            </motion.div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="flex h-[260px] flex-col items-center justify-center text-center p-6 space-y-3">
                        <div className="rounded-xl bg-on-surface/[0.01] p-5 border border-dashed border-on-surface/8">
                          <Activity className="h-8 w-8 text-ui-muted opacity-20 mb-2 mx-auto" />
                          <p className="text-[12px] font-bold text-ui-muted opacity-40">等待首批分析结果</p>
                          <p className="text-[10px] font-medium text-ui-muted opacity-25 mt-1 max-w-[160px]">文件分析汇聚完成后即刻呈现。</p>
                        </div>
                      </div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
