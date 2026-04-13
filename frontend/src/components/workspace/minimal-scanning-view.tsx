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
  const hasSpecificItem = isSpecificScanItem(currentItem);
  const hasStartedReading = processedCount > 0 || recentCount > 0 || hasSpecificItem || batchCount > 0;
  const isSummarizing = isThinking || /汇总|输出|结论|完成|校验|修正/.test(message);
  const analysisTitle = batchCount > 1 ? "并行批次分析" : "逐项读取与分析";
  const analysisDetail = batchCount > 1
    ? `已完成 ${completedBatches}/${batchCount} 个批次`
    : hasSpecificItem
      ? `当前处理：${currentItem}`
      : processedCount > 0
        ? `已处理 ${processedCount}/${totalCount || "?"} 项`
        : "等待进入逐项分析";

  return [
    {
      id: "prepare",
      title: "建立扫描任务",
      detail: totalCount > 0 ? `已发现 ${totalCount} 个待分析条目，正在建立扫描上下文` : "正在确认目录范围与可见条目",
      state: hasStartedReading || isSummarizing ? "done" : "active",
      icon: Search,
    },
    {
      id: "read-structure",
      title: "读取目录结构",
      detail: message.includes("目录结构") ? message : "确认当前目录中的文件与子目录边界",
      state: hasStartedReading || isSummarizing ? "done" : "active",
      icon: Layers,
    },
    {
      id: "analyze",
      title: analysisTitle,
      detail: analysisDetail,
      state: isSummarizing ? "done" : hasStartedReading ? "active" : "pending",
      icon: FileText,
    },
    {
      id: "summarize",
      title: isRetrying ? "交叉校验纠错" : "汇总扫描结论",
      detail: isRetrying
        ? (message || "正在重新校验扫描结果")
        : isSummarizing
          ? (message || "正在整理扫描结果")
          : "等待进入结果汇总与结论输出",
      state: isSummarizing || isRetrying ? "active" : "pending",
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
  const pipelineSteps = React.useMemo(() => derivePipelineSteps(scanner), [scanner]);

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

                <div className="ml-auto flex items-center gap-2.5 rounded-[10px] bg-on-surface/[0.03] pl-3 py-1 pr-2 border border-on-surface/[0.04] max-w-[46%]">
                  <Loader2 className="h-3 w-3 shrink-0 animate-spin text-on-surface-variant/40" />
                  <div className="min-w-0">
                    <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-ui-muted">当前处理</div>
                    <p className="text-[12px] font-bold text-on-surface/60 leading-none truncate" title={currentItem}>
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
                <AnimatePresence initial={false}>
                  {recentItems.length > 0 || isThinking ? (
                    <div className="space-y-0.5 px-3 py-2">
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
                          className="mb-2"
                        >
                          {/* AI 思考时的流动骨架屏 */}
                          <div className="group flex flex-col rounded-[8px] py-2 pr-1 transition-all min-w-0 bg-primary/5 pl-4 border-l-[2px] border-primary/20">
                            <div className="flex items-center gap-2">
                              <Sparkles className="h-3.5 w-3.5 shrink-0 text-primary/60 animate-pulse" />
                              <div className="flex-1 flex flex-col gap-1.5">
                                <div className="h-3.5 w-48 rounded bg-primary/10 animate-pulse" />
                                <div className="h-2.5 w-3/4 rounded bg-on-surface/[0.03] animate-pulse" />
                              </div>
                            </div>
                          </div>
                        </motion.div>
                      )}

                      {recentItems.map((item, idx) => (
                        <motion.div
                          key={item.item_id + idx}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          className="group/item relative my-0.5 flex flex-col rounded-[8px] py-1.5 pr-1 transition-all min-w-0 hover:bg-on-surface/[0.02]"
                          style={{ paddingLeft: "16px" }}
                        >
                          <div className="flex items-start gap-2.5 min-w-0">
                            <FileText className="h-3.5 w-3.5 shrink-0 mt-0.5 text-on-surface-variant/40" />
                            <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="flex-1 truncate tracking-tight min-w-0 text-[13px] text-on-surface-variant/75 group-hover/item:text-on-surface transition-colors">
                                  {item.display_name}
                                </span>
                                {item.suggested_purpose && (
                                  <span className="rounded-[5px] bg-surface-container-highest/60 px-1.5 py-0.5 text-[11px] font-semibold leading-none text-on-surface/60">
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
                      ))}
                    </div>
                  ) : (
                    <div className="flex h-36 flex-col items-center justify-center gap-2 text-[12px] font-medium text-on-surface-variant/35">
                      <Archive className="h-6 w-6 opacity-20" />
                      还没有可显示的内容
                    </div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
