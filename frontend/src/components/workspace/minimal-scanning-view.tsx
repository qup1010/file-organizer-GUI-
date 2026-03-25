"use client";

import React from "react";
import { motion } from "framer-motion";
import { GitBranch, Layers3, Loader2 } from "lucide-react";

import { ScannerProgress } from "@/types/session";

interface MinimalScanningViewProps {
  scanner: ScannerProgress;
  progressPercent: number;
}

export function MinimalScanningView({ scanner, progressPercent }: MinimalScanningViewProps) {
  const currentItem = scanner.current_item || "正在准备扫描";
  const itemPercent = Math.max(0, Math.min(100, progressPercent));
  const isParallel = (scanner.batch_count || 0) > 1;
  const batchCount = Math.max(1, scanner.batch_count || 0);
  const completedBatches = Math.max(0, Math.min(batchCount, scanner.completed_batches || 0));
  const batchPercent = isParallel ? (completedBatches / batchCount) * 100 : itemPercent;
  const statusMessage = scanner.message || (isParallel ? "系统正在并行分析多个批次" : "AI 正在逐项分析文件元数据与用途");

  return (
    <div className="flex h-full w-full items-center justify-center bg-surface px-5 py-8 lg:px-8">
      <div className="w-full max-w-4xl rounded-[12px] border border-on-surface/8 bg-surface-container-lowest shadow-[0_10px_28px_rgba(37,45,40,0.05)]">
        <div className="border-b border-on-surface/8 bg-surface-container-low px-5 py-5 lg:px-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex items-start gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-[10px] border border-primary/12 bg-primary/6 text-primary">
                <Loader2 className="h-7 w-7 animate-spin-slow" />
              </div>
              <div className="space-y-2">
                <h2 className="text-[1.25rem] font-black font-headline tracking-tight text-on-surface lg:text-[1.45rem]">
                  正在同步目录结构
                </h2>
                <p className="max-w-2xl text-[14px] leading-7 text-ui-muted">{statusMessage}</p>
                <div className="inline-flex items-center gap-2 rounded-full border border-primary/12 bg-primary/8 px-3 py-1 text-[12px] font-medium text-primary">
                  {isParallel ? <GitBranch className="h-3.5 w-3.5" /> : <Layers3 className="h-3.5 w-3.5" />}
                  {isParallel ? `并行分析 ${batchCount} 批` : "顺序分析"}
                </div>
              </div>
            </div>

            <div className="rounded-[10px] border border-on-surface/8 bg-surface-container-lowest px-4 py-3">
              <div className="text-ui-meta text-ui-muted">当前处理条目</div>
              <p className="mt-1 break-all text-[13px] font-medium text-on-surface">{currentItem}</p>
            </div>
          </div>
        </div>

        <div className="grid gap-4 p-5 lg:grid-cols-[1fr_1fr] lg:px-6 lg:py-6">
          <div className="rounded-[10px] border border-on-surface/8 bg-surface-container-low px-4 py-4">
            <div className="flex items-center justify-between gap-4">
              <span className="text-[12px] font-medium text-ui-muted">条目进度</span>
              <span className="text-[14px] font-semibold tabular-nums text-on-surface">
                {scanner.processed_count || 0}/{scanner.total_count || 0}
              </span>
            </div>
            <div className="mt-4 flex h-2 overflow-hidden rounded-full bg-on-surface/6">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${Math.max(2, itemPercent)}%` }}
                transition={{ duration: 0.5, ease: "easeOut" }}
                className="rounded-full bg-primary"
              />
            </div>
            <p className="mt-4 text-[13px] leading-6 text-ui-muted">
              {isParallel
                ? "按已完成批次折算到条目总量，用来表示整体扫描覆盖度。"
                : "单线程模式下按已触达或已确认的条目持续推进，属于实时估算进度。"}
            </p>
          </div>

          <div className="rounded-[10px] border border-on-surface/8 bg-surface-container-low px-4 py-4">
            <div className="flex items-center justify-between gap-4">
              <span className="text-[12px] font-medium text-ui-muted">{isParallel ? "批次进度" : "当前完成度"}</span>
              <span className="text-[14px] font-semibold tabular-nums text-on-surface">
                {isParallel ? `${completedBatches}/${batchCount}` : `${Math.round(itemPercent)}%`}
              </span>
            </div>
            <div className="mt-4 flex h-2 overflow-hidden rounded-full bg-on-surface/6">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${Math.max(2, batchPercent)}%` }}
                transition={{ duration: 0.5, ease: "easeOut" }}
                className="rounded-full bg-on-surface"
              />
            </div>
            <p className="mt-4 text-[13px] leading-6 text-ui-muted">
              {isParallel
                ? "每个批次完成后都会立即更新；批次越多，等待时间通常也会更长。"
                : "扫描完成后，系统会自动继续生成第一版整理建议。"}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
