"use client";

import React, { useMemo } from "react";
import { FolderPlus, Palette, Plus } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { FolderIconCandidate, IconPreviewVersion } from "@/types/icon-workbench";
import { IconWorkbenchFolderCard } from "./icon-workbench-folder-card";

interface IconWorkbenchFolderListProps {
  folders: FolderIconCandidate[];
  expandedFolderId: string | null;
  onToggleExpand: (id: string | null) => void;
  onSelectVersion: (folderId: string, versionId: string) => void;
  onZoom: (version: IconPreviewVersion) => void;
  onApplyVersion: (folderId: string, version: IconPreviewVersion) => void;
  onRegenerate: (folderId: string) => void;
  onRestore: (folderId: string) => void;
  onRemoveTarget: (folderId: string) => void;
  onRemoveBg: (folderId: string, version: IconPreviewVersion) => void;
  onDeleteVersion: (folderId: string, versionId: string) => void;
  processingBgVersionIds?: Set<string>;
  baseUrl: string;
  apiToken: string;
  isApplyingId?: string | null;
  activeProcessingId?: string | null;
  desktopReady: boolean;
  hasSelectedStyle: boolean;
  generateBlockedReason?: string | null;
  isProcessing?: boolean;
  processingFolderId?: string | null;
  onAddTargets?: () => void;
  isTargetDropActive?: boolean;
  onTargetDrop?: (event: React.DragEvent<HTMLDivElement>) => void;
  onTargetDragOver?: (event: React.DragEvent<HTMLDivElement>) => void;
  onTargetDragLeave?: (event: React.DragEvent<HTMLDivElement>) => void;
  dropZoneRef?: React.RefObject<HTMLDivElement | null>;
  isDraggingGlobal?: boolean;
}

export function IconWorkbenchFolderList({
  folders,
  expandedFolderId,
  onToggleExpand,
  onSelectVersion,
  onZoom,
  onApplyVersion,
  onRegenerate,
  onRestore,
  onRemoveTarget,
  onRemoveBg,
  onDeleteVersion,
  processingBgVersionIds,
  baseUrl,
  apiToken,
  isApplyingId,
  activeProcessingId,
  desktopReady,
  hasSelectedStyle,
  generateBlockedReason,
  isProcessing,
  processingFolderId,
  onAddTargets,
  isTargetDropActive = false,
  onTargetDrop,
  onTargetDragOver,
  onTargetDragLeave,
  dropZoneRef,
  isDraggingGlobal = false,
}: IconWorkbenchFolderListProps) {
  const hasReadyVersions = useMemo(
    () => folders.some((folder) => folder.versions.some((version) => version.status === "ready")),
    [folders],
  );

  return (
    <div className="flex flex-1 flex-col min-h-0 overflow-hidden">
      <div className="glass-surface flex flex-col gap-2 border-b border-on-surface/6 px-6 py-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[16px] font-black tracking-tight text-on-surface">目标文件夹</p>
          </div>
          <span className="rounded-full border border-on-surface/8 bg-surface-container-low px-3 py-1 text-[12px] font-bold text-ui-muted">
            {folders.length} 个目标
          </span>
        </div>
      </div>

      <div className="flex-1 relative min-h-0 overflow-y-auto px-6 py-4 scrollbar-thin">
        {!hasSelectedStyle && folders.length > 0 && !hasReadyVersions && (
          <div className="mb-6 flex animate-in fade-in slide-in-from-top-2 duration-500 flex-col items-center gap-4 rounded-xl border border-dashed border-primary/20 bg-primary/2 p-10 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-[20px] bg-primary/10 text-primary shadow-sm ring-1 ring-primary/20">
              <Palette className="h-8 w-8" />
            </div>
            <div className="max-w-[360px] space-y-2">
              <p className="text-[18px] font-black tracking-tight text-on-surface">请先选择风格模板</p>
              <p className="text-[14px] leading-relaxed text-ui-muted opacity-80">
                你已经选择了目标文件夹。请先点击顶部的<b>“选择风格模板”</b>，系统将根据选定风格为你生成第一版图标。
              </p>
            </div>
          </div>
        )}

        {folders.length === 0 ? (
          <motion.div
            ref={dropZoneRef}
            data-testid="icon-target-dropzone"
            onDrop={onTargetDrop}
            onDragOver={onTargetDragOver}
            onDragLeave={onTargetDragLeave}
            className={cn(
              "flex flex-col items-center justify-center rounded-[20px] border-2 border-dashed py-20 transition-all duration-300",
              isTargetDropActive 
                ? "border-primary/50 bg-primary/10 shadow-2xl shadow-primary/20" 
                : isDraggingGlobal 
                  ? "border-primary/40 bg-primary/[0.04] shadow-md shadow-primary/5" 
                  : "border-on-surface/8 bg-surface-container-lowest"
            )}
          >
            <motion.div 
              animate={{ 
                y: isTargetDropActive ? [-4, 0, -4] : isDraggingGlobal ? [-2, 0, -2] : 0,
                scale: isTargetDropActive ? 1.15 : 1
              }}
              transition={{ repeat: Infinity, duration: 1.5, ease: "easeInOut" }}
              className={cn(
                "mb-6 flex h-14 w-14 items-center justify-center rounded-[12px] transition-all duration-300 shadow-sm",
                isTargetDropActive
                  ? "bg-primary text-white"
                  : isDraggingGlobal 
                    ? "bg-primary/10 text-primary border border-primary/20" 
                    : "bg-on-surface/[0.03] text-on-surface/20 border border-on-surface/8 shadow-inner"
              )}
            >
              <FolderPlus className="h-7 w-7" />
            </motion.div>
            <div className="max-w-[420px] text-center space-y-4">
              <div className="space-y-1">
                <h3 className={cn(
                  "text-[17px] font-black tracking-tight transition-colors duration-300",
                  isTargetDropActive ? "text-primary" : "text-on-surface"
                )}>
                  {isTargetDropActive ? "松手即刻导入目标" : "尚未添加目标文件夹"}
                </h3>
                <p className="text-[13px] font-medium leading-relaxed text-ui-muted opacity-60">
                  图标工坊会自动检测文件夹的实际用途，并根据你定义的风格生成系统级图标预览。把文件夹拖到这里，或者点击下方按钮开始第一步。
                </p>
              </div>
              <Button 
                variant="primary" 
                size="lg" 
                onClick={onAddTargets} 
                className="h-11 px-8 rounded-[6px] font-black text-[14px] shadow-sm hover:shadow-md transition-all active:scale-95"
              >
                选择目标文件夹 <FolderPlus className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </motion.div>
        ) : (
          <div className="flex flex-col gap-3 pb-24">
            <motion.div
              ref={dropZoneRef}
              onDrop={onTargetDrop}
              onDragOver={onTargetDragOver}
              onDragLeave={onTargetDragLeave}
              className={cn(
                "mb-2 flex flex-col items-center justify-center gap-2 rounded-[12px] border-2 border-dashed py-6 transition-all duration-300 group/add-more",
                isTargetDropActive 
                  ? "border-primary/50 bg-primary/10 shadow-lg shadow-primary/10" 
                  : isDraggingGlobal 
                    ? "border-primary/40 bg-primary/[0.04] shadow-sm shadow-primary/5" 
                    : "border-on-surface/8 bg-on-surface/[0.015]"
              )}
            >
              <div className={cn(
                "flex h-8 w-8 items-center justify-center rounded-full transition-colors",
                isTargetDropActive ? "bg-primary text-white" : isDraggingGlobal ? "bg-primary/20 text-primary" : "bg-on-surface/[0.03] text-on-surface/20 group-hover/add-more:bg-primary/10 group-hover/add-more:text-primary"
              )}>
                <Plus className="h-4 w-4" />
              </div>
              <div className="text-center">
                <p className={cn(
                  "text-[14px] font-black tracking-tight transition-colors",
                  isTargetDropActive ? "text-primary" : isDraggingGlobal ? "text-primary/70" : "text-on-surface/70"
                )}>
                  {isTargetDropActive ? "松手即刻追加" : isDraggingGlobal ? "拖拽到这里追加" : "还可以继续拖拽文件夹到这里追加"}
                </p>
                <p className="text-[11px] font-bold text-ui-muted opacity-50">
                  点击上方工具栏也可以手动选择
                </p>
              </div>
            </motion.div>
            {folders.map((folder) => (
              <IconWorkbenchFolderCard
                key={folder.folder_id}
                folder={folder}
                isExpanded={expandedFolderId === folder.folder_id}
                onToggleExpand={() => onToggleExpand(expandedFolderId === folder.folder_id ? null : folder.folder_id)}
                onSelectVersion={(versionId) => onSelectVersion(folder.folder_id, versionId)}
                onZoom={(version) => onZoom(version)}
                onApplyVersion={(version) => onApplyVersion(folder.folder_id, version)}
                onRegenerate={() => onRegenerate(folder.folder_id)}
                onRestore={() => onRestore(folder.folder_id)}
                onRemoveTarget={() => onRemoveTarget(folder.folder_id)}
                onRemoveBg={(version) => onRemoveBg(folder.folder_id, version)}
                onDeleteVersion={(versionId) => onDeleteVersion(folder.folder_id, versionId)}
                processingBgVersionIds={processingBgVersionIds}
                baseUrl={baseUrl}
                apiToken={apiToken}
                isApplyingId={activeProcessingId === folder.folder_id ? isApplyingId : null}
                desktopReady={desktopReady}
                hasSelectedStyle={hasSelectedStyle}
                generateBlockedReason={generateBlockedReason}
                isProcessing={isProcessing}
                isActiveProcessing={processingFolderId === folder.folder_id}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
