"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CircleDashed,
  FolderOpen,
  LoaderCircle,
  RefreshCw,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { FolderIconCandidate, IconPreviewVersion } from "@/types/icon-workbench";
import { buildImageSrc, getCurrentVersion, hasReadyVersion, resolvePreviewVersion } from "./icon-workbench-utils";
import { IconWorkbenchVersionThumb } from "./icon-workbench-version-thumb";

interface IconWorkbenchFolderCardProps {
  folder: FolderIconCandidate;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onSelectVersion: (versionId: string) => void;
  onZoom: (version: IconPreviewVersion) => void;
  onApplyVersion: (version: IconPreviewVersion) => void;
  onRegenerate: () => void;
  onRestore: () => void;
  onRemoveTarget: () => void;
  onRemoveBg: (version: IconPreviewVersion) => void;
  onDeleteVersion: (versionId: string) => void;
  processingBgVersionIds?: Set<string>;
  baseUrl: string;
  apiToken: string;
  isApplyingId?: string | null;
  desktopReady: boolean;
  hasSelectedStyle: boolean;
  generateBlockedReason?: string | null;
  isProcessing?: boolean;
  isActiveProcessing?: boolean;
}

export function IconWorkbenchFolderCard({
  folder,
  isExpanded,
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
  desktopReady,
  hasSelectedStyle,
  generateBlockedReason,
  isProcessing,
  isActiveProcessing,
}: IconWorkbenchFolderCardProps) {
  const currentVersion = useMemo(() => getCurrentVersion(folder), [folder]);
  const currentPreview = useMemo(() => resolvePreviewVersion(folder), [folder]);
  const hasVersions = folder.versions.length > 0;
  const generateLabel = "生成新版本";
  const [previewLoaded, setPreviewLoaded] = useState(false);
  const [previewFailed, setPreviewFailed] = useState(false);

  useEffect(() => {
    setPreviewLoaded(false);
    setPreviewFailed(false);
  }, [currentPreview?.version_id]);

  const status = useMemo(() => {
    if (isActiveProcessing) {
      return {
        label: "生成中",
        detail: "当前版本正在刷新",
        color: "text-primary",
        icon: LoaderCircle,
        animate: true,
      };
    }
    if (currentVersion?.status === "error") {
      return {
        label: `当前版本 v${currentVersion.version_number} 异常`,
        detail: currentVersion.error_message || folder.last_error || "请重新生成或切换到其他版本",
        color: "text-error",
        icon: AlertCircle,
      };
    }
    if (currentVersion?.status === "ready") {
      return {
        label: `当前版本 v${currentVersion.version_number} 就绪`,
        detail: folder.applied_version_id === currentVersion.version_id ? "已应用到文件夹" : "尚未应用到系统图标",
        color: "text-primary",
        icon: CheckCircle2,
        animate: false,
      };
    }
    if (folder.last_error) {
      return {
        label: "当前文件夹异常",
        detail: folder.last_error,
        color: "text-error",
        icon: AlertCircle,
      };
    }
    if (hasReadyVersion(folder)) {
      const readyVersion = currentPreview;
      return {
        label: `已有可用版本${readyVersion ? ` v${readyVersion.version_number}` : ""}`,
        detail: "展开后可预览、切换或应用",
        color: "text-primary/80",
        icon: CheckCircle2,
        animate: false,
      };
    }
    if (folder.analysis_status === "ready") {
      return { label: "分析完成", detail: "可以继续生成首个图标版本", color: "text-primary/70", icon: CheckCircle2, animate: false };
    }
    return { label: "待处理", detail: "请先选择模板并开始生成", color: "text-ui-muted", icon: CircleDashed, animate: false };
  }, [currentPreview, currentVersion, folder, isActiveProcessing]);

  const StatusIcon = status.icon;

  return (
    <div
      className={cn(
        "group flex flex-col overflow-hidden rounded-[12px] border transition-all duration-200",
        isExpanded
          ? "border-primary/20 bg-surface-container-lowest shadow-[0_12px_32px_rgba(0,0,0,0.08)]"
          : "border-on-surface/8 bg-surface-container-low/40 hover:border-primary/14 hover:bg-surface-container-lowest",
      )}
    >
      <div className="flex cursor-pointer items-center gap-3 px-4 py-3" onClick={onToggleExpand}>
        <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-[10px] border border-on-surface/6 bg-surface-container-lowest">
          {currentPreview ? (
            <div className="relative h-full w-full">
              {!previewLoaded && !previewFailed ? (
                <div className="absolute inset-0 z-10 flex items-center justify-center bg-surface-container-lowest">
                  <LoaderCircle className="h-4 w-4 animate-spin text-primary/40" />
                </div>
              ) : null}
              {!previewFailed ? (
                <img
                  src={buildImageSrc(currentPreview, baseUrl, apiToken)}
                  alt="preview"
                  loading="lazy"
                  decoding="async"
                  onLoad={() => setPreviewLoaded(true)}
                  onError={() => setPreviewFailed(true)}
                  className={cn(
                    "h-full w-full object-cover transition-opacity duration-200",
                    previewLoaded ? "opacity-100" : "opacity-0",
                  )}
                />
              ) : null}
            </div>
          ) : (
            <FolderOpen className="h-5 w-5 text-primary/30" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[15px] font-bold tracking-tight text-on-surface">{folder.folder_name}</h3>
          <p className="truncate text-[11px] text-ui-muted">{folder.folder_path}</p>
        </div>

        <div className={cn("hidden min-w-[180px] flex-col items-end gap-0.5 sm:flex", status.color)}>
          <div className="flex items-center gap-1.5">
            <StatusIcon className={cn("h-3.5 w-3.5", status.animate ? "animate-spin" : undefined)} />
            <span className="text-[12px] font-semibold">{status.label}</span>
          </div>
          <span className="max-w-[220px] truncate text-[10px] font-bold text-ui-muted">{status.detail}</span>
        </div>

        {!isExpanded && currentVersion?.status === "ready" ? (
          <div className="hidden items-center gap-2 md:flex">
            <Button
              variant="secondary"
              size="sm"
              onClick={(event: React.MouseEvent) => {
                event.stopPropagation();
                onZoom(currentVersion);
              }}
            >
              预览
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={(event: React.MouseEvent) => {
                event.stopPropagation();
                onApplyVersion(currentVersion);
              }}
              disabled={isProcessing || !desktopReady}
            >
              应用
            </Button>
          </div>
        ) : null}

        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onRemoveTarget();
          }}
          className="flex h-8 w-8 items-center justify-center rounded-full text-ui-muted transition-colors hover:bg-error/8 hover:text-error"
          title="移出本次目标"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="flex h-8 w-8 items-center justify-center rounded-[4px] text-ui-muted transition-colors group-hover:bg-on-surface/4">
          {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </div>
      </div>

      {isExpanded ? (
        <div className="animate-fadeIn border-t border-on-surface/6 bg-surface-container-lowest/30 p-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[12px] font-bold uppercase tracking-widest text-ui-muted">
                版本历史 ({folder.versions.length})
              </span>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={(event: React.MouseEvent) => {
                    event.stopPropagation();
                    onRegenerate();
                  }}
                  disabled={isProcessing || !hasSelectedStyle || Boolean(generateBlockedReason)}
                >
                  <RefreshCw className="mr-2 h-3.5 w-3.5" />
                  {generateLabel}
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={isProcessing || !desktopReady}
                  onClick={(event: React.MouseEvent) => {
                    event.stopPropagation();
                    onRestore();
                  }}
                >
                  恢复上次状态
                </Button>
              </div>
            </div>

            {!hasSelectedStyle ? (
              <p className="text-[12px] leading-6 text-ui-muted">请先选择风格，再为这个目标文件夹生成图标版本。</p>
            ) : generateBlockedReason ? (
              <p className="text-[12px] leading-6 text-error/80">{generateBlockedReason}</p>
            ) : null}

            {isActiveProcessing ? (
              <div className="flex items-center gap-2 rounded-[10px] border border-primary/12 bg-primary/6 px-3 py-2 text-[12px] font-black text-primary">
                <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                <span>正在生成预览，完成后将刷新列表...</span>
              </div>
            ) : null}

            {hasVersions ? (
              <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-thin">
                {folder.versions.map((version) => (
                  <IconWorkbenchVersionThumb
                    key={version.version_id}
                    version={version}
                    isSelected={version.version_id === folder.current_version_id}
                    isApplied={version.version_id === folder.applied_version_id}
                    baseUrl={baseUrl}
                    apiToken={apiToken}
                    onSelect={() => onSelectVersion(version.version_id)}
                    onZoom={() => onZoom(version)}
                    onApply={() => onApplyVersion(version)}
                    onRemoveBg={() => onRemoveBg(version)}
                    onDelete={() => onDeleteVersion(version.version_id)}
                    isApplying={isApplyingId === version.version_id}
                    isRemovingBg={processingBgVersionIds?.has(`${folder.folder_id}-${version.version_id}`)}
                    isProcessing={isProcessing}
                  />
                ))}
              </div>
            ) : (
              <div className="flex h-[110px] flex-col items-center justify-center rounded-xl border border-dashed border-on-surface/10 bg-on-surface/[0.02]">
                <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-full bg-primary/8 text-primary/40">
                  <RefreshCw className="h-4 w-4" />
                </div>
                <p className="px-5 text-center text-[12.5px] font-medium leading-relaxed text-ui-muted opacity-80">
                  {!hasSelectedStyle
                    ? "先选择风格模板后，才能为这个目标文件夹生成新版本图标。"
                    : "可以直接为这个目标文件夹生成新版本图标。"}
                </p>
              </div>
            )}
          </div>

          {folder.analysis ? (
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-on-surface/6 bg-surface-container-lowest p-3 shadow-sm">
                <span className="text-[10px] font-bold uppercase tracking-widest text-ui-muted">识别主题</span>
                <p className="mt-1 font-semibold text-on-surface">{folder.analysis.visual_subject}</p>
              </div>
              <div className="rounded-xl border border-on-surface/6 bg-surface-container-lowest p-3 shadow-sm">
                <span className="text-[10px] font-bold uppercase tracking-widest text-ui-muted">类别</span>
                <p className="mt-1 font-semibold text-on-surface">{folder.analysis.category}</p>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
