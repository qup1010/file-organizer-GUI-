"use client";

import React from "react";
import { CheckCircle2, FolderDown, Info, LoaderCircle, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

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
  selectedTemplateName,
  generateBlockedReason,
  generateProgressHint,
}: IconWorkbenchFooterBarProps) {
  if (targetCount <= 0) {
    return null;
  }

  return (
    <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 animate-slideUp">
      <div className="flex items-center gap-4 rounded-[12px] border border-on-surface/8 bg-surface-container-lowest/80 p-1.5 shadow-[0_12px_44px_rgba(0,0,0,0.18)] backdrop-blur-xl">
        <div className="flex items-center gap-3.5 pl-4 pr-1">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] bg-primary/10 text-primary shadow-[inset_0_0_15px_rgba(var(--primary-rgb),0.1)]">
            <FolderDown className="h-5.5 w-5.5" />
          </div>
          <div className="flex flex-col">
            <span className="whitespace-nowrap text-[15px] font-black tracking-tight text-on-surface">{targetCount} 个目标文件夹</span>
            <span className="max-w-[120px] truncate text-[11px] font-bold text-ui-muted">
              {selectedTemplateName ? `模板：${selectedTemplateName}` : "准备就绪"}
            </span>
          </div>
        </div>

        <div className="h-10 w-px shrink-0 bg-on-surface/8" />

        <div className="flex items-center gap-2.5 pr-1">
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <Button
                variant="primary"
                size="lg"
                onClick={(event: React.MouseEvent) => {
                  event.stopPropagation();
                  onGenerate();
                }}
                disabled={Boolean(generateBlockedReason) || isGenerating || isApplying || isRemovingBgBatch}
                className="h-11 shrink-0 rounded-[10px] px-8 text-[14px] font-black shadow-[0_8px_16px_rgba(var(--primary-rgb),0.2)] transition-all active:scale-[0.98] focus:ring-0 whitespace-nowrap"
              >
                {isGenerating ? <LoaderCircle className="h-4.5 w-4.5 animate-spin" /> : <Sparkles className="h-4.5 w-4.5" />}
                <span className="ml-2">{isGenerating ? "正在生成..." : `生成 ${targetCount} 个预览`}</span>
              </Button>

              <div className="flex items-center gap-1.5 rounded-[12px] bg-on-surface/5 p-1 border border-on-surface/5 shrink-0">
                <Button
                  variant="secondary"
                  size="md"
                  onClick={(event: React.MouseEvent) => {
                    event.stopPropagation();
                    onRemoveBgBatch();
                  }}
                  disabled={!canRemoveBgBatch || isGenerating || isApplying || isRemovingBgBatch}
                  className="h-9 shrink-0 rounded-[8px] border-none bg-transparent px-4 text-[13px] font-bold text-on-surface hover:bg-on-surface/10 transition-all disabled:opacity-30 whitespace-nowrap shadow-none"
                >
                  {isRemovingBgBatch ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <span className="text-[14px] leading-none mb-0.5">✂</span>}
                  <span className="ml-1.5">{isRemovingBgBatch ? "正在处理背景..." : "批量去除背景"}</span>
                </Button>

                <div className="h-4 w-px bg-on-surface/5" />

                <Button
                  variant="secondary"
                  size="md"
                  onClick={(event: React.MouseEvent) => {
                    event.stopPropagation();
                    onApplyBatch();
                  }}
                  disabled={!canApplyBatch || isGenerating || isApplying || isRemovingBgBatch}
                  className="h-9 shrink-0 rounded-[8px] border-none bg-transparent px-4 text-[13px] font-bold text-on-surface hover:bg-on-surface/10 transition-all disabled:opacity-30 whitespace-nowrap shadow-none"
                >
                  {isApplying ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                  <span className="ml-1.5">{isApplying ? "正在应用..." : "批量应用图标"}</span>
                </Button>
              </div>
            </div>
            
            <p className={cn("min-h-[14px] px-2 text-[10.5px] font-bold transition-opacity", 
              isGenerating || isRemovingBgBatch || isApplying ? "animate-pulse text-primary" : 
              generateBlockedReason ? "text-error/70" : "text-ui-muted"
            )}>
              {isGenerating ? (generateProgressHint || "正在分析目标文件夹并生成预览...") :
               isRemovingBgBatch ? "正在处理已选预览的背景..." :
               isApplying ? "正在把选中的预览应用到目标文件夹..." :
               generateBlockedReason || "先确认预览结果，再批量应用图标。"}
            </p>
          </div>

          <div className="group relative ml-1">
            <Info className="h-4 w-4 cursor-help text-on-surface/25 transition-colors hover:text-on-surface/50" />
            <div className="pointer-events-none absolute bottom-full left-1/2 mb-3 w-52 -translate-x-1/2 scale-95 rounded-[10px] border border-on-surface/10 bg-surface-container-lowest/95 p-4 text-[11px] font-medium leading-relaxed text-on-surface opacity-0 shadow-2xl backdrop-blur-md transition-all group-hover:scale-100 group-hover:opacity-100 italic">
              生成结果会先保留为预览。点击“批量应用图标”后，才会写入目标文件夹的图标设置。
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
