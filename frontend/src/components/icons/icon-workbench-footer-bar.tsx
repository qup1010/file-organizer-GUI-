"use client";

import React from "react";
import { FolderDown, Info, LoaderCircle, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { BackgroundRemovalBatchProgress } from "@/types/icon-workbench";

interface IconWorkbenchFooterBarProps {
  targetCount: number;
  isGenerating: boolean;
  isApplying: boolean;
  onGenerate: () => void;
  onApplyBatch: () => void;
  canApplyBatch: boolean;
  onRemoveBgBatch: () => void;
  canRemoveBgBatch: boolean;
  isRemovingBgBatch: boolean;
  removeBgBatchProgress?: BackgroundRemovalBatchProgress | null;
  selectedTemplateName?: string | null;
  generateBlockedReason?: string | null;
  generateProgressHint?: string | null;
}

export function IconWorkbenchFooterBar({
  targetCount,
  isGenerating,
  isApplying,
  onGenerate,
  onApplyBatch,
  canApplyBatch,
  onRemoveBgBatch,
  canRemoveBgBatch,
  isRemovingBgBatch,
  removeBgBatchProgress,
  selectedTemplateName,
  generateBlockedReason,
  generateProgressHint,
}: IconWorkbenchFooterBarProps) {
  if (targetCount <= 0) {
    return null;
  }

  const isBusy = isGenerating || isApplying || isRemovingBgBatch;

  return (
    <div className="fixed bottom-6 left-1/2 z-50 w-full max-w-[1000px] -translate-x-1/2 px-6">
      <div className="animate-in fade-in slide-in-from-bottom-4 duration-700 flex flex-col gap-3 overflow-hidden rounded-[20px] border border-on-surface/8 bg-surface-container-lowest/85 p-2 shadow-[0_24px_48px_-12px_rgba(0,0,0,0.2),0_0_0_1px_rgba(255,255,255,0.1)_inset] backdrop-blur-2xl md:flex-row md:items-center md:gap-6 md:p-2.5">
        
        {/* Left Section: Target Status */}
        <div className="flex items-center gap-4 pl-3 pr-2 border-r border-on-surface/6">
          <div className={cn(
            "flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px] transition-all duration-500",
            isBusy ? "bg-primary/20 text-primary scale-105 shadow-[0_0_20px_rgba(var(--primary-rgb),0.3)]" : "bg-primary/10 text-primary/70"
          )}>
            {isBusy ? (
              <LoaderCircle className="h-6 w-6 animate-spin" />
            ) : (
              <FolderDown className="h-6 w-6" />
            )}
          </div>
          <div className="flex flex-col min-w-0">
            <h4 className="whitespace-nowrap text-[16px] font-black tracking-tight text-on-surface leading-tight">
              {targetCount} 个目标对象
            </h4>
            <div className="flex items-center gap-1.5 mt-0.5 max-w-[200px]">
              <div className={cn("h-1.5 w-1.5 rounded-full", isBusy ? "bg-primary animate-pulse" : "bg-on-surface/20")} />
              <span className="truncate text-[11px] font-black text-ui-muted uppercase tracking-wider">
                {selectedTemplateName ? selectedTemplateName : "等待任务"}
              </span>
            </div>
          </div>
        </div>

        {/* Center/Right Section: Dynamic Content & Actions */}
        <div className="flex flex-1 flex-col justify-center gap-1 min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-4">
            
            {/* Action Feedback Area */}
            <div className="flex-1 min-w-0 pr-4">
               <p className={cn(
                 "text-[13px] font-bold leading-tight transition-all duration-300",
                 isBusy ? "text-primary italic animate-in fade-in slide-in-from-left-2" : 
                 generateBlockedReason ? "text-error/80" : "text-on-surface/60"
               )}>
                 {isGenerating ? (generateProgressHint || "分析目录结构并生成智能图标预览...") :
                  isRemovingBgBatch ? (
                    removeBgBatchProgress?.activeFolderNames?.length
                      ? removeBgBatchProgress.activeFolderNames.length === 1
                        ? `正在为「${removeBgBatchProgress.activeFolderNames[0]}」去除背景，已完成 ${removeBgBatchProgress.completed}/${removeBgBatchProgress.total}。`
                        : `正在同时为 ${removeBgBatchProgress.activeFolderNames.map((name) => `「${name}」`).join("、")} 去除背景，已完成 ${removeBgBatchProgress.completed}/${removeBgBatchProgress.total}。`
                      : `正在进行批量处理...`
                  ) :
                  isApplying ? "正在将选中的图标应用到 Windows 文件夹属性..." :
                  (generateBlockedReason && (canApplyBatch || canRemoveBgBatch))
                    ? "由于配置缺失暂无法生成新预览，但可直接应用已有版本。"
                    : (generateBlockedReason || "预览完成后，点击批量按钮将图标正式写入系统。")}
               </p>
            </div>

            {/* Buttons Group */}
            <div className="flex items-center gap-2 shrink-0">
              
              {/* Secondary Tools Group */}
              <div className="flex items-center gap-1 rounded-xl bg-on-surface/4 p-1">
                 <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => { e.stopPropagation(); onRemoveBgBatch(); }}
                    disabled={!canRemoveBgBatch || isBusy}
                    className="h-10 rounded-lg px-4 text-[13px] font-black text-on-surface/80 hover:bg-on-surface/10 hover:text-on-surface transition-all active:scale-[0.96]"
                  >
                    去背景
                  </Button>
                  <div className="h-4 w-px bg-on-surface/8 mx-0.5" />
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => { e.stopPropagation(); onApplyBatch(); }}
                    disabled={!canApplyBatch || isBusy}
                    className="h-10 rounded-lg px-4 text-[13px] font-black text-on-surface/80 hover:bg-on-surface/10 hover:text-on-surface transition-all active:scale-[0.96]"
                  >
                    应用图标
                  </Button>
              </div>

              {/* Primary Action Button */}
              <Button
                variant="primary"
                size="lg"
                onClick={(e) => { e.stopPropagation(); onGenerate(); }}
                disabled={Boolean(generateBlockedReason) || isBusy}
                className="group h-12 rounded-[14px] px-8 text-[15px] font-black shadow-[0_12px_24px_-8px_rgba(var(--primary-rgb),0.5)] transition-all hover:shadow-[0_16px_32px_-8px_rgba(var(--primary-rgb),0.6)] active:scale-[0.96] disabled:shadow-none"
              >
                {isGenerating ? (
                   <LoaderCircle className="h-5 w-5 animate-spin mr-3" />
                ) : (
                   <div className="relative mr-3">
                     <Sparkles className="h-5 w-5 transition-transform group-hover:scale-110 group-hover:rotate-12" />
                     <div className="absolute -inset-1 blur-sm bg-white/20 opacity-0 group-hover:opacity-100 transition-opacity" />
                   </div>
                )}
                {isGenerating ? "处理中" : `开始生成图标`}
              </Button>
            </div>

          </div>
        </div>

        {/* Global Help Hint (Desktop Only) */}
        {!isBusy && (
          <div className="group relative ml-auto mr-3 hidden xl:block">
            <Info className="h-4.5 w-4.5 cursor-help text-on-surface/20 transition-colors hover:text-on-surface/40" />
            <div className="pointer-events-none absolute bottom-full right-0 mb-4 w-60 translate-y-2 scale-95 rounded-2xl border border-on-surface/10 bg-surface-container-lowest/98 p-5 text-[12px] font-medium leading-relaxed text-on-surface opacity-0 shadow-2xl backdrop-blur-xl transition-all group-hover:translate-y-0 group-hover:scale-100 group-hover:opacity-100 ring-1 ring-black/5">
              <div className="mb-2 flex items-center gap-2 font-black text-primary">
                <Sparkles className="h-3.5 w-3.5" />
                <span>使用提示</span>
              </div>
              生成的结果仅为预览，点击名为「应用图标」的按钮后，才会真正触发 Windows 原生接口修改目录配置。
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
