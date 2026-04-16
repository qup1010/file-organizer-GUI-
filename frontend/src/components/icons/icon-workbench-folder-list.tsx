"use client";

import React, { useMemo, useState } from "react";
import { FolderPlus, Palette, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
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
}: IconWorkbenchFolderListProps) {
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

      <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4 scrollbar-thin">
        {!hasSelectedStyle && folders.length > 0 && (
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
          <div className="flex flex-col items-center justify-center py-20 animate-in fade-in zoom-in-95 duration-700">
            <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-[12px] bg-on-surface/[0.03] text-on-surface/20 border border-on-surface/8 shadow-inner">
              <FolderPlus className="h-7 w-7" />
            </div>
            <div className="max-w-[420px] text-center space-y-4">
              <div className="space-y-1">
                <h3 className="text-[17px] font-black tracking-tight text-on-surface">尚未添加目标文件夹</h3>
                <p className="text-[13px] font-medium leading-relaxed text-ui-muted opacity-60">
                  图标工坊会自动检测文件夹的实际用途，并根据你定义的风格生成系统级图标预览。点击下方按钮开始第一步。
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
          </div>
        ) : (
          <div className="flex flex-col gap-3 pb-24">
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
