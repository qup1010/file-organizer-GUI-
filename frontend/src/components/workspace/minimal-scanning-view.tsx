"use client";
import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Activity,
  AlertCircle,
  CheckCircle2,
  Clock3,
  FolderOpen,
  StopCircle, 
  Loader2,
  FileText, 
  Archive,
  FileIcon,
  Image as ImageIcon,
  Film,
  Music,
  FileJson,
  FileCode,
  Binary,
  Terminal,
} from "lucide-react";
import Link from "next/link";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

import { ScannerProgress } from "@/types/session";
import { Button } from "@/components/ui/button";
import { deriveScannerProgressViewModel } from "@/lib/scanner-progress-view";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

function getFileIcon(filename: string, entryType?: string) {
  if (entryType === "dir") {
    return { icon: FolderOpen, color: "text-amber-600", bg: "bg-amber-500/10" };
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
  const codeExts = ["js", "ts", "tsx", "jsx", "py", "go", "rs", "cpp", "c", "h", "java", "html", "css"];
  if (codeExts.includes(ext)) {
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
  const viewModel = React.useMemo(
    () => deriveScannerProgressViewModel(scanner, progressPercent),
    [scanner, progressPercent],
  );
  const [scanStartedAt] = React.useState(() => Date.now());
  const [elapsedSeconds, setElapsedSeconds] = React.useState(0);

  React.useEffect(() => {
    if (scanner.status === "completed") {
      return;
    }
    const timer = window.setInterval(() => {
      setElapsedSeconds(Math.max(0, Math.floor((Date.now() - scanStartedAt) / 1000)));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [scanStartedAt, scanner.status]);

  const formatElapsedLabel = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex h-full flex-col overflow-hidden bg-surface">
      {/* 顶部仪表盘 - 紧凑、高度对齐 */}
      <div className="z-10 border-b border-on-surface/10 bg-surface-container-lowest/50 px-6 py-4 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1280px] flex-col gap-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/20">
                <Activity className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="rounded bg-primary/20 px-1.5 py-0.5 text-[10px] font-black uppercase tracking-widest text-primary">
                    {viewModel.eyebrow}
                  </span>
                  <div className="h-3 w-[1px] bg-on-surface/10" />
                  <span className="text-[10px] font-bold text-ui-muted uppercase tracking-widest">{viewModel.stageLabel}</span>
                </div>
                <h2 className="mt-0.5 text-[18px] font-black tracking-tight text-on-surface">
                  {viewModel.title}
                </h2>
              </div>
            </div>

            <div className="flex items-center gap-6">
              <div className="hidden flex-col items-end sm:flex">
                <span className="text-[10px] font-black tracking-widest text-ui-muted/40">已用时间</span>
                <span className="font-mono text-[16px] font-bold text-on-surface">{formatElapsedLabel(elapsedSeconds)}</span>
              </div>
              <div className="h-8 w-[1px] bg-on-surface/10" />
              {onAbort && (
                <button
                  type="button"
                  onClick={onAbort}
                  disabled={aborting}
                  className="group flex h-10 items-center gap-2 rounded-lg border border-on-surface/10 bg-surface-container-lowest px-4 text-[11px] font-black uppercase tracking-widest transition-all hover:bg-error/5 hover:text-error hover:border-error/20 active:scale-95 disabled:opacity-40"
                >
                  {aborting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <StopCircle className="h-3.5 w-3.5" />}
                  <span>{aborting ? "正在停止" : "停止扫描"}</span>
                </button>
              )}
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-on-surface/5">
              <motion.div
                className="h-full bg-primary"
                initial={{ width: 0 }}
                animate={{ width: `${Math.max(viewModel.progressPercent, 4)}%` }}
                transition={{ duration: 0.5, ease: "easeOut" }}
              />
            </div>
            <span className="min-w-[48px] font-mono text-[13px] font-black text-primary text-right">
              {Math.round(viewModel.progressPercent)}%
            </span>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        <div className="grid h-full max-w-[1280px] mx-auto grid-cols-1 overflow-hidden lg:grid-cols-[1fr_360px]">
          {/* 左侧：深度实时分析状态 */}
          <div className="flex flex-col border-r border-on-surface/5 bg-on-surface/[0.01]">
            <div className="flex-1 overflow-y-auto p-8 scrollbar-thin">
              <AnimatePresence mode="wait">
                <motion.div
                  key={viewModel.currentItem || "init"}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10 }}
                  className="space-y-8"
                >
                  <div className="space-y-4">
                    <div className="flex items-center gap-2">
                       <span className="flex h-5 w-5 items-center justify-center rounded-md bg-primary/10 text-primary">
                         <Terminal className="h-3 w-3" />
                       </span>
                       <span className="text-[10px] font-black tracking-widest text-primary/60">正在查看的项目</span>
                    </div>
                    
                    <div className="min-h-[140px] rounded-2xl border border-on-surface/10 bg-surface-container-lowest p-6">
                      <div className="flex items-start gap-4">
                        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-on-surface/[0.03] border border-on-surface/5">
                           <FileText className="h-6 w-6 text-primary/60" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <h3 className="truncate text-[22px] font-black tracking-tight text-on-surface">
                            {viewModel.currentItem || "正在准备读取目录..."}
                          </h3>
                          <div className="mt-2 flex flex-wrap items-center gap-3">
                             <div className="flex items-center gap-1.5 rounded-full border border-on-surface/8 px-2.5 py-0.5 text-[11px] font-bold text-ui-muted opacity-80">
                                <Activity className="h-3 w-3" />
                                {viewModel.progressText || "等待扫描就绪"}
                             </div>
                             <span className="text-[11px] font-medium text-ui-muted/40 italic">{viewModel.description}</span>
                          </div>
                        </div>
                      </div>
                      
                      <div className="mt-6 grid grid-cols-2 gap-4 border-t border-on-surface/5 pt-6">
                         <div>
                            <span className="text-[10px] font-black tracking-widest text-ui-muted/40">读取范围</span>
                            <p className="mt-1 text-[13px] font-bold text-on-surface/80">包含子目录</p>
                         </div>
                         <div>
                            <span className="text-[10px] font-black tracking-widest text-ui-muted/40">当前状态</span>
                            <div className="mt-1 flex items-center gap-1.5 text-[13px] font-bold text-success-dim">
                               <div className="h-1.5 w-1.5 rounded-full bg-success-dim animate-pulse" />
                               正在分析
                            </div>
                         </div>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                     <div className="flex items-center gap-2">
                       <span className="flex h-5 w-5 items-center justify-center rounded-md bg-on-surface/5 text-on-surface/40">
                         <CheckCircle2 className="h-3 w-3" />
                       </span>
                       <span className="text-[10px] font-black tracking-widest text-ui-muted/40">安全说明</span>
                    </div>
                    <p className="text-[12px] leading-relaxed text-ui-muted/60 max-w-[600px]">
                      扫描阶段只读取文件信息和必要摘要，不会移动或改写原文件。真正移动前还会先做安全检查。
                    </p>
                  </div>
                </motion.div>
              </AnimatePresence>
            </div>
          </div>

          {/* 右侧：实时日志与发现汇总 - 终端感设计 */}
          <div className="flex flex-col bg-surface">
            <div className="border-b border-on-surface/5 px-6 py-4">
               <div className="flex items-center justify-between">
                  <h3 className="text-[11px] font-black tracking-widest text-ui-muted">扫描记录</h3>
                  <span className="rounded-full bg-on-surface/5 px-2 py-0.5 text-[10px] font-bold text-ui-muted">
                    已发现 {viewModel.totalCount} 项
                  </span>
               </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4 scrollbar-thin">
               <div className="flex flex-col gap-1.5">
                  <AnimatePresence initial={false}>
                    {viewModel.recentCompletedItems.length > 0 ? (
                      viewModel.recentCompletedItems.map((item) => {
                        const style = getFileIcon(item.display_name, item.entry_type);
                        const Icon = style.icon;
                        return (
                          <motion.div
                            key={item.item_id}
                            initial={{ opacity: 0, x: 10 }}
                            animate={{ opacity: 1, x: 0 }}
                            className="flex items-center gap-3 rounded-lg border border-transparent p-2 transition-colors hover:border-on-surface/5 hover:bg-on-surface/[0.02]"
                          >
                            <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-on-surface/5 bg-on-surface/3 shadow-none", style.bg)}>
                              <Icon className={cn("h-4 w-4", style.color)} />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-[12px] font-bold text-on-surface/80">{item.display_name}</p>
                              <p className="truncate text-[10px] font-medium text-ui-muted/40 tracking-tight">已读取</p>
                            </div>
                          </motion.div>
                        );
                      })
                    ) : (
                      <div className="flex flex-col items-center justify-center py-20 text-center opacity-20">
                         <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full border-2 border-dashed border-on-surface/30">
                            <Loader2 className="h-6 w-6 animate-spin" />
                         </div>
                         <p className="text-[12px] font-bold tracking-widest">等待发现项目...</p>
                      </div>
                    )}
                  </AnimatePresence>
               </div>
            </div>
            
            {!isModelConfigured && (
              <Link href="/settings" className="m-4 rounded-lg border border-warning/20 bg-warning/5 p-4 transition-all hover:bg-warning/8">
                <div className="flex gap-3">
                  <AlertCircle className="h-4 w-4 shrink-0 text-warning" />
                  <div className="space-y-1">
                    <p className="text-[12px] font-black text-warning">模型还没配置好</p>
                    <p className="text-[11px] leading-tight text-warning/60 font-medium">当前只能读取目录结构。如需智能分类，请先到设置里配置文本模型。</p>
                  </div>
                </div>
              </Link>
            )}
          </div>
        </div>
      </div>
      
      {/* 底部流水线状态 */}
      <div className="border-t border-on-surface/5 bg-surface-container-lowest/30 px-6 py-2.5">
        <div className="mx-auto flex max-w-[1280px] items-center justify-between">
           <div className="flex items-center gap-6">
              {[
                { step: 1, label: "读取目录结构", done: true },
                { step: 2, label: "分析项目内容", active: true },
                { step: 3, label: "生成整理方案" }
              ].map((s) => (
                <div key={s.step} className="flex items-center gap-2">
                   <div className={cn(
                     "flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-black",
                     s.done ? "bg-success text-white" : s.active ? "bg-primary text-white" : "bg-on-surface/10 text-ui-muted"
                   )}>
                      {s.done ? "✓" : s.step}
                   </div>
                   <span className={cn(
                     "text-[10px] font-bold uppercase tracking-wider",
                     s.done || s.active ? "text-on-surface/60" : "text-ui-muted/30"
                   )}>{s.label}</span>
                   {s.step < 3 && <div className="ml-4 h-px w-8 bg-on-surface/5" />}
                </div>
              ))}
           </div>
        </div>
      </div>
    </div>
  );
}
