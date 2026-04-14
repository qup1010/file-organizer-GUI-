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

type PipelineStepState = "active" | "done" | "pending";

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

function getFileIcon(filename: string) {
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

  // Step 1: Prepare
  const isPrepareDone = totalCount > 0 || isCompleted;
  
  // Step 2: Read structure
  const isReadStructureDone = totalCount > 0 || isCompleted;
  
  // Step 3: Analyze
  const isAnalyzeActive = !isCompleted && isReadStructureDone;
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
  const isSummarizeActive = isRetrying || (!isCompleted && message.includes("结果需要修正"));

  return [
    {
      id: "prepare",
      title: "建立扫描任务",
      detail: totalCount > 0 ? `发现 ${totalCount} 个待分析项` : "正在确认目录范围",
      state: isPrepareDone ? "done" : "active",
      icon: Search,
    },
    {
      id: "read-structure",
      title: "读取目录索引",
      detail: isReadStructureDone ? "已提取文件列表" : "正在梳理文件关联",
      state: isReadStructureDone ? "done" : isPrepareDone ? "active" : "pending",
      icon: Layers,
    },
    {
      id: "analyze",
      title: analysisTitle,
      detail: analysisDetail,
      state: isAnalyzeDone ? "done" : isAnalyzeActive ? "active" : "pending",
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
      state: isSummarizeDone ? "done" : isSummarizeActive ? "active" : "pending",
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

  return (
    <div className="flex h-full flex-col overflow-hidden bg-transparent">
      <div className="flex-1 overflow-y-auto p-4 lg:p-6 scrollbar-thin">
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          className="mx-auto max-w-[1360px] space-y-4"
        >
          {!isModelConfigured && (
            <div className="flex items-center justify-between gap-4 rounded-[10px] border border-warning/20 bg-warning-container/20 p-4 backdrop-blur-sm">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-warning/15 text-warning">
                  <AlertCircle className="h-5 w-5" />
                </div>
                <div className="space-y-1">
                  <p className="text-[14px] font-black text-on-surface">AI 文本模型未配置</p>
                  <p className="text-[12px] font-medium text-ui-muted">未配置模型将无法分析文件具体用途，建议前往“设置”页面完成配置。</p>
                </div>
              </div>
              <Link href="/settings">
                <Button variant="secondary" size="sm" className="whitespace-nowrap px-4 font-bold">
                  去配置模型
                </Button>
              </Link>
            </div>
          )}

          {/* 统一外壳容器：与 PreviewPanel 完全一致 */}
          <div className="flex flex-col rounded-[16px] border border-on-surface/8 bg-surface-container-lowest shadow-[0_24px_56px_-12px_rgba(0,0,0,0.06)] overflow-hidden min-w-0 relative">
            {/* 后台进度条填充动画 */}
            <div className="absolute top-0 left-0 right-0 h-1 bg-surface-container-low/50 z-0">
              <motion.div
                className={cn("h-full", isRetrying ? "bg-warning" : "bg-primary")}
                initial={{ width: 0 }}
                animate={{ width: `${Math.max(2, progressPercent)}%` }}
                transition={{ type: "spring", stiffness: 30, damping: 15 }}
              />
            </div>

            {/* Header: Title + Stats + Summary (对齐 PreviewPanel) */}
            <div className={cn(
              "border-b border-on-surface/6 px-5 py-4 relative z-10 transition-colors duration-500",
              isRetrying ? "bg-warning/5" : "bg-surface-container-low/15"
            )}>
              <div className="flex items-center justify-between gap-4 mb-3.5">
                <div className="space-y-0.5">
                  <h2 className="flex items-center gap-2 text-[15px] font-black tracking-tight text-on-surface">
                    {isRetrying ? (
                      <RefreshCw className="h-4 w-4 text-warning animate-spin-slow" />
                    ) : (
                      <Activity className="h-4 w-4 text-primary" />
                    )} 
                    {isRetrying ? "正在交叉校验纠错..." : "正在进行深度扫描"}
                  </h2>
                  <p className="text-[12px] text-ui-muted opacity-80">
                    {isRetrying ? "检测到特殊文件特征，已触发深度复核，请稍候。" : "正在读取文件，分析其内容特征与逻辑归属。"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <div className={cn(
                    "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold transition-colors",
                    isRetrying ? "bg-warning/15 text-warning" : "bg-surface-container-low/60 text-on-surface-variant/70"
                  )}>
                    {scanner.message || "扫描中..."}
                  </div>
                  {onAbort && (
                    <button
                      onClick={onAbort}
                      disabled={aborting}
                      className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold text-error/80 hover:bg-error/10 hover:text-error transition-colors disabled:opacity-50"
                    >
                      <StopCircle className="h-3 w-3" />
                      {aborting ? "中止中" : "中止"}
                    </button>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-y-3 gap-x-6 border-t border-on-surface/[0.04] pt-3.5">
                <div className="flex items-center gap-6">
                  <div className="flex flex-col">
                    <span className="text-[10.5px] font-bold uppercase tracking-wider text-ui-muted opacity-50">进度</span>
                    <span className="text-[15px] font-black tabular-nums text-on-surface">
                      {Math.round(progressPercent)}%
                    </span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[10.5px] font-bold uppercase tracking-wider text-ui-muted opacity-50">已处理</span>
                    <span className="text-[15px] font-black tabular-nums text-on-surface">
                      {scanner.processed_count} <span className="text-[11px] text-ui-muted font-medium">/ {scanner.total_count}</span>
                    </span>
                  </div>
                  {scanner.batch_count ? (
                    <div className="flex flex-col">
                      <span className="text-[10.5px] font-bold uppercase tracking-wider text-ui-muted opacity-50">并发队列</span>
                      <span className="text-[15px] font-black tabular-nums text-on-surface">
                        {scanner.completed_batches || 0} <span className="text-[11px] text-ui-muted font-medium">/ {scanner.batch_count}</span>
                      </span>
                    </div>
                  ) : null}
                </div>

                <div className="ml-auto flex items-center gap-3 rounded-full bg-primary/[0.04] border border-primary/10 pl-1 py-1 pr-3 max-w-[46%] shadow-[0_2px_12px_-2px_rgba(var(--primary-rgb),0.08)]">
                  <div className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
                    <motion.div 
                      className="absolute inset-0 rounded-full bg-primary/20"
                      animate={{ scale: [1, 1.4, 1], opacity: [0.5, 0, 0.5] }}
                      transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                    />
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[9px] font-black uppercase tracking-[0.18em] text-primary/50 leading-none mb-1">正在处理</div>
                    <p className="text-[12px] font-black text-on-surface leading-none truncate" title={currentItem}>
                      {currentItem}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Tree Section Mapped to Concurrent Log Stream (对齐 PreviewPanel) */}
            <div className="flex flex-col min-w-0">
              <div className="flex items-center justify-between px-5 py-3 border-b border-on-surface/[0.04]">
                <h3 className="flex items-center gap-2 text-[12px] font-bold text-on-surface/50">
                  <Layers className="h-3.5 w-3.5" /> 处理流水线
                </h3>
                
                <div className="flex items-center gap-2">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary/40 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-primary/80"></span>
                  </span>
                  <span className="text-[11px] font-bold text-primary/70">实时汇聚中</span>
                </div>
              </div>

              <div className="min-h-[280px] max-h-[55vh] overflow-y-auto overflow-x-hidden p-2 scrollbar-thin">
                <div className="space-y-3 px-3 py-3">
                  <div className="space-y-2">
                    {pipelineSteps.map((step, idx) => {
                      const Icon = step.icon;
                      const isActiveStep = step.state === "active";
                      const isDoneStep = step.state === "done";

                      return (
                        <motion.div
                          key={step.id}
                          initial={{ opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: idx * 0.04 }}
                          className={cn(
                            "relative flex items-start gap-3 rounded-[10px] border px-3.5 py-3 transition-colors",
                            isActiveStep && "border-primary/18 bg-primary/[0.045]",
                            isDoneStep && "border-success/15 bg-success/5",
                            step.state === "pending" && "border-on-surface/[0.05] bg-on-surface/[0.02]",
                          )}
                        >
                          <div className={cn(
                            "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border",
                            isActiveStep && "border-primary/20 bg-primary/10 text-primary",
                            isDoneStep && "border-success/20 bg-success/10 text-success",
                            step.state === "pending" && "border-on-surface/8 bg-surface text-on-surface-variant/45",
                          )}>
                            <Icon className={cn("h-4 w-4", isActiveStep && "animate-pulse")} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <p className="text-[13px] font-bold text-on-surface">{step.title}</p>
                              <span className={cn(
                                "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em]",
                                isActiveStep && "bg-primary/10 text-primary",
                                isDoneStep && "bg-success/10 text-success",
                                step.state === "pending" && "bg-on-surface/[0.05] text-on-surface-variant/45",
                              )}>
                                {isDoneStep ? "已完成" : isActiveStep ? "进行中" : "待开始"}
                              </span>
                            </div>
                            <p className="mt-1 text-[11px] leading-relaxed text-on-surface-variant/60">
                              {step.detail}
                            </p>
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>

                  <AnimatePresence initial={false}>
                    {hasLiveItems ? (
                      <motion.div
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        className="rounded-[12px] border border-on-surface/[0.05] bg-surface p-2.5"
                      >
                        {recentItems.length > 0 ? (
                          <div className="mb-2 px-1 text-[11px] font-semibold text-ui-muted">
                            最近已扫描 / 正在分析的文件
                          </div>
                        ) : null}
                        {isThinking && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            exit={{ opacity: 0, height: 0 }}
                            className="mb-3 space-y-1"
                          >
                            <div className="px-1 py-1 text-[11px] font-semibold text-primary/80 flex items-center gap-1.5 mb-1.5">
                              <Sparkles className="h-3 w-3 animate-pulse" />
                              正在分析剩余文件...
                            </div>
                            {Array.from({ length: Math.min(4, Math.max(1, totalCount - processedCount)) }).map((_, i) => (
                              <div key={`skeleton-${i}`} className="group flex flex-col rounded-[8px] py-1.5 pr-1 transition-all min-w-0 pl-[16px]">
                                <div className="flex items-start gap-2.5 min-w-0">
                                  <FileText className="h-3.5 w-3.5 shrink-0 mt-0.5 text-primary/20 animate-pulse" />
                                  <div className="flex-1 min-w-0 flex flex-col gap-1.5 mt-0.5">
                                    <div className="flex items-center gap-2">
                                      <div className={cn("h-3 rounded bg-primary/10 animate-pulse", ["w-32", "w-24", "w-40", "w-28"][i % 4])} />
                                      <div className="h-4 w-10 rounded-[5px] bg-primary/[0.05] animate-pulse" />
                                    </div>
                                    <div className={cn("h-2 rounded bg-on-surface/[0.03] animate-pulse", ["w-3/4", "w-2/3", "w-4/5", "w-1/2"][i % 4])} />
                                  </div>
                                </div>
                              </div>
                            ))}
                          </motion.div>
                        )}

                        {recentItems.map((item, idx) => {
                          const fileMeta = getFileIcon(item.source_relpath || item.display_name);
                          const CustomIcon = fileMeta.icon;
                          
                          return (
                            <motion.div
                              key={item.item_id + idx}
                              initial={{ opacity: 0, x: -10, y: 5 }}
                              animate={{ opacity: 1, x: 0, y: 0 }}
                              className="group/item relative my-0.5 flex flex-col rounded-[8px] py-1.5 pr-1 transition-all min-w-0 hover:bg-on-surface/[0.02]"
                              style={{ paddingLeft: "16px" }}
                            >
                              <div className="flex items-start gap-2.5 min-w-0">
                                <div className={cn("mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-on-surface/5 shadow-sm", fileMeta.bg)}>
                                  <CustomIcon className={cn("h-3.5 w-3.5", fileMeta.color)} />
                                </div>
                                <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                                  <div className="flex items-center gap-2 min-w-0">
                                    <span className="flex-1 truncate tracking-tight min-w-0 text-[13px] font-bold text-on-surface transition-colors">
                                      {item.display_name}
                                    </span>
                                    {item.suggested_purpose && (
                                      <span className={cn(
                                        "rounded-[5px] px-1.5 py-0.5 text-[11px] font-black leading-none",
                                        item.suggested_purpose === "准备分析" ? "bg-on-surface/[0.03] text-ui-muted/60" : "bg-primary/10 text-primary"
                                      )}>
                                        {item.suggested_purpose}
                                      </span>
                                    )}
                                  </div>
                                  {item.summary && (
                                    <div className="line-clamp-1 text-[11px] font-medium leading-relaxed text-on-surface-variant/40">
                                      {item.summary}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </motion.div>
                          );
                        })}
                      </motion.div>
                    ) : (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="flex items-center gap-2 rounded-[12px] border border-dashed border-on-surface/[0.07] bg-on-surface/[0.015] px-3.5 py-3 text-[12px] font-medium text-on-surface-variant/40"
                      >
                        <Archive className="h-4 w-4 shrink-0 opacity-40" />
                        正在准备首批扫描结果，流水线状态会继续更新。
                      </motion.div>
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
