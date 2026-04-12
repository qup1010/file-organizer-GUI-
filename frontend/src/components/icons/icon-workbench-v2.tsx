"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, FolderOpen, FolderPlus, LoaderCircle, Palette, Sparkles } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorAlert } from "@/components/ui/error-alert";
import { createApiClient } from "@/lib/api";
import { createIconWorkbenchApiClient } from "@/lib/icon-workbench-api";
import { getApiBaseUrl, getApiToken, invokeTauriCommand, isTauriDesktop, openDirectoryWithTauri, pickDirectoriesWithTauri } from "@/lib/runtime";
import { cn } from "@/lib/utils";
import type {
  ApplyIconResult,
  FolderIconCandidate,
  IconWorkbenchConfig,
  IconPreviewVersion,
  IconWorkbenchSession,
} from "@/types/icon-workbench";
import { IconWorkbenchFooterBar } from "./icon-workbench-footer-bar";
import { IconWorkbenchFolderList } from "./icon-workbench-folder-list";
import { IconWorkbenchPreviewModal } from "./icon-workbench-preview-modal";
import { IconWorkbenchStylePanel } from "./icon-workbench-style-panel";
import { IconWorkbenchTemplateDrawer } from "./icon-workbench-template-drawer";
import { IconWorkbenchToolbar } from "./icon-workbench-toolbar";
import {
  buildImageSrc,
  getGenerateFlowPresentation,
  isFolderReady,
  type GenerateFlowProgress,
  type GenerateFlowStage,
} from "./icon-workbench-utils";
import { useBackgroundRemoval } from "./use-background-removal";
import { useIconTemplates } from "./use-icon-templates";

const APP_CONTEXT_EVENT = "file-organizer-context-change";
const ICONS_CONTEXT_KEY = "icons_header_context";
const ICONS_WORKSPACE_STATE_KEY = "icons_workspace_state";

interface PersistedIconsWorkspaceState {
  sessionId: string;
  selectedTemplateId: string;
  expandedFolderId: string | null;
}

type GuideActionKind = "target" | "style" | "generate";
function IconWorkbenchGuideBar({
  statusText,
  primaryCtaLabel,
  primaryActionKind,
  primaryCtaDisabled,
  onPrimaryAction,
}: {
  statusText: string;
  primaryCtaLabel: string;
  primaryActionKind: GuideActionKind;
  primaryCtaDisabled: boolean;
  onPrimaryAction: () => void;
}) {
  const ActionIcon = primaryActionKind === "style" ? Palette : primaryActionKind === "generate" ? Sparkles : FolderPlus;

  return (
    <div className="border-b border-primary/10 bg-primary/4 px-6 py-3.5 backdrop-blur-xl">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <ActionIcon className="h-4 w-4" />
          </div>
          <p className="truncate text-[13.5px] font-bold tracking-tight text-on-surface leading-none pt-0.5">{statusText}</p>
        </div>
        <Button
          variant="primary"
          size="md"
          onClick={onPrimaryAction}
          disabled={primaryCtaDisabled}
          className="shrink-0 px-6 h-9 rounded-full shadow-[0_8px_20px_-4px_rgba(var(--primary-rgb),0.25)]"
        >
          <ActionIcon className="h-4 w-4" />
          {primaryCtaLabel}
        </Button>
      </div>
    </div>
  );
}

export default function IconWorkbenchV2() {
  const baseUrl = getApiBaseUrl();
  const apiToken = getApiToken();
  const desktopReady = isTauriDesktop();
  const iconApi = useMemo(() => createIconWorkbenchApiClient(baseUrl, apiToken), [apiToken, baseUrl]);
  const systemApi = useMemo(() => createApiClient(baseUrl, apiToken), [apiToken, baseUrl]);

  const [session, setSession] = useState<IconWorkbenchSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionLabel, setActionLabel] = useState<string | null>(null);
  const [lastAppliedFolderPath, setLastAppliedFolderPath] = useState<string | null>(null);
  const [generateProgress, setGenerateProgress] = useState<GenerateFlowProgress | null>(null);

  const [expandedFolderId, setExpandedFolderId] = useState<string | null>(null);
  const [stylePanelOpen, setStylePanelOpen] = useState(false);
  const [templateDrawerOpen, setTemplateDrawerOpen] = useState(false);
  const [previewVersion, setPreviewVersion] = useState<IconPreviewVersion | null>(null);

  const [activeProcessingId, setActiveProcessingId] = useState<string | null>(null);
  const [isApplyingId, setIsApplyingId] = useState<string | null>(null);
  const [batchApplyLoading, setBatchApplyLoading] = useState(false);

  const [restoreConfirmOpen, setRestoreConfirmOpen] = useState(false);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [folderToRestore, setFolderToRestore] = useState<FolderIconCandidate | null>(null);
  const [restoringSession, setRestoringSession] = useState(true);

  const [workbenchConfig, setWorkbenchConfig] = useState<IconWorkbenchConfig | null>(null);

  useEffect(() => {
    iconApi.getConfig().then((payload) => setWorkbenchConfig(payload.config)).catch(() => {
      setWorkbenchConfig(null);
    });
  }, [iconApi]);

  const isImageModelConfigured = useMemo(() => {
    if (!workbenchConfig) return true;
    const m = workbenchConfig.image_model;
    return Boolean(m?.configured ?? (m?.secret_state === "stored" && m?.model && m?.base_url));
  }, [workbenchConfig]);
  const {
    templates,
    templatesLoading,
    templatesInitialized,
    selectedTemplateId,
    setSelectedTemplateId,
    selectedTemplate,
    templateActionLoading,
    templateNameDraft,
    setTemplateNameDraft,
    templateDescriptionDraft,
    setTemplateDescriptionDraft,
    templatePromptDraft,
    setTemplatePromptDraft,
    reloadTemplates,
    createTemplate,
    updateTemplate,
    deleteTemplate,
  } = useIconTemplates({ iconApi, setError, setNotice });
  const {
    processingBgVersionIds,
    isRemovingBgBatch,
    handleRemoveBg,
    handleRemoveBgBatch,
  } = useBackgroundRemoval({
    desktopReady,
    session,
    setSession,
    setError,
    setNotice,
  });

  const targetCount = session?.folders.length ?? 0;
  const hasTargets = targetCount > 0;
  const isGeneratingFlow = Boolean(generateProgress);
  const isBusy = Boolean(actionLabel) || isGeneratingFlow;
  const generatePresentation = useMemo(
    () => (generateProgress ? getGenerateFlowPresentation(generateProgress) : null),
    [generateProgress],
  );
  const generateStageSteps: Array<{ key: GenerateFlowStage; label: string }> = useMemo(() => ([
    { key: "analyzing", label: "分析目录" },
    { key: "applying_template", label: "套用风格" },
    { key: "generating", label: "生成预览" },
  ]), []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const detail = hasTargets ? `已选 ${targetCount} 个目标文件夹` : "选择目标文件夹并生成预览";
    window.localStorage.setItem(ICONS_CONTEXT_KEY, JSON.stringify({ detail }));
    window.dispatchEvent(new Event(APP_CONTEXT_EVENT));
  }, [hasTargets, targetCount]);

  const hasSelectedStyle = Boolean(selectedTemplate);
  const allFolderIds = useMemo(() => session?.folders.map((folder) => folder.folder_id) ?? [], [session]);
  const latestTargetPath = useMemo(() => {
    const lastPath = session?.target_paths.at(-1);
    if (lastPath) return lastPath;
    return session?.folders.at(-1)?.folder_path || null;
  }, [session]);
  const canApplyBatch = useMemo(() => {
    if (!session) return false;
    return session.folders.some((folder) => isFolderReady(folder));
  }, [session]);

  const applySession = useCallback((nextSession: IconWorkbenchSession) => {
    setSession(nextSession);
    setExpandedFolderId((current) => (
      current && nextSession.folders.some((folder) => folder.folder_id === current) ? current : null
    ));
    setPreviewVersion((current) => {
      if (!current) return current;
      const stillExists = nextSession.folders.some((folder) => folder.versions.some((version) => version.version_id === current.version_id));
      return stillExists ? current : null;
    });
    setFolderToRestore((current) => {
      if (!current) return current;
      return nextSession.folders.find((folder) => folder.folder_id === current.folder_id) || null;
    });
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const raw = window.localStorage.getItem(ICONS_WORKSPACE_STATE_KEY);
    if (!raw) {
      setRestoringSession(false);
      return;
    }

    let parsed: PersistedIconsWorkspaceState | null = null;
    try {
      parsed = JSON.parse(raw) as PersistedIconsWorkspaceState;
    } catch {
      window.localStorage.removeItem(ICONS_WORKSPACE_STATE_KEY);
      setRestoringSession(false);
      return;
    }

    if (!parsed?.sessionId) {
      window.localStorage.removeItem(ICONS_WORKSPACE_STATE_KEY);
      setRestoringSession(false);
      return;
    }

    if (parsed.selectedTemplateId) {
      setSelectedTemplateId(parsed.selectedTemplateId);
    }
    setExpandedFolderId(parsed.expandedFolderId || null);

    let cancelled = false;
    iconApi.getSession(parsed.sessionId)
      .then((nextSession) => {
        if (!cancelled) {
          applySession(nextSession);
        }
      })
      .catch(() => {
        if (!cancelled) {
          window.localStorage.removeItem(ICONS_WORKSPACE_STATE_KEY);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setRestoringSession(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [applySession, iconApi, setSelectedTemplateId]);

  useEffect(() => {
    if (typeof window === "undefined" || restoringSession) {
      return;
    }
    if (!session) {
      window.localStorage.removeItem(ICONS_WORKSPACE_STATE_KEY);
      return;
    }
    const payload: PersistedIconsWorkspaceState = {
      sessionId: session.session_id,
      selectedTemplateId,
      expandedFolderId,
    };
    window.localStorage.setItem(ICONS_WORKSPACE_STATE_KEY, JSON.stringify(payload));
  }, [expandedFolderId, restoringSession, selectedTemplateId, session]);

  const topStatusText = useMemo(() => {
    if (!hasTargets) {
      return "先选择一个或多个目标文件夹";
    }
    if (!hasSelectedStyle) {
      return `已选择 ${targetCount} 个目标文件夹，下一步请选择风格模板`;
    }
    return `已选择 ${targetCount} 个目标文件夹和「${selectedTemplate?.name || "当前模板"}」模板，可以开始生成预览`;
  }, [hasSelectedStyle, hasTargets, selectedTemplate?.name, targetCount]);

  const primaryCtaLabel = !hasTargets ? "选择目标文件夹" : !hasSelectedStyle ? "选择风格模板" : `生成 ${targetCount} 个预览`;
  const primaryActionKind: GuideActionKind = !hasTargets ? "target" : !hasSelectedStyle ? "style" : "generate";
  const generateBlockedReason = !hasTargets
    ? "先选择目标文件夹"
    : !hasSelectedStyle
      ? "先选择一个风格模板"
      : isBusy
        ? "正在生成，请稍候"
        : null;

  const handleChooseTargets = useCallback(async () => {
    setError(null);
    try {
      let nextTargetPaths: string[] = [];
      if (desktopReady) {
        nextTargetPaths = (await pickDirectoriesWithTauri()) || [];
      } else {
        const selectedDir = (await systemApi.selectDir()).path;
        if (selectedDir) {
          nextTargetPaths = [selectedDir];
        }
      }
      if (nextTargetPaths.length === 0) return;

      setActionLabel(session ? "正在添加目标文件夹..." : "正在创建目标集合...");
      const nextSession = session
        ? await iconApi.updateTargets(session.session_id, { target_paths: nextTargetPaths, mode: "append" })
        : await iconApi.createSession(nextTargetPaths);
      applySession(nextSession);
      setNotice(session
        ? `已追加 ${nextTargetPaths.length} 个目标文件夹，当前共 ${nextSession.folder_count} 个。`
        : `已选择 ${nextSession.folder_count} 个目标文件夹。`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "选择目标文件夹失败");
    } finally {
      setActionLabel(null);
    }
  }, [applySession, desktopReady, iconApi, session, systemApi]);

  const runGenerateFlow = async (folderIds: string[]) => {
    if (!session || folderIds.length === 0) return;
    if (!selectedTemplateId) {
      setError("请先选择一个风格模板。");
      return;
    }

    const targetFolders = folderIds
      .map((folderId) => session.folders.find((folder) => folder.folder_id === folderId))
      .filter((folder): folder is FolderIconCandidate => Boolean(folder));

    const totalFolders = targetFolders.length || folderIds.length;
    setError(null);
    setGenerateProgress({
      stage: "analyzing",
      totalFolders,
      completedFolders: 0,
      currentFolderId: null,
      currentFolderName: null,
    });

    try {
      const foldersToAnalyze = folderIds.filter(id => {
        const folder = session.folders.find(f => f.folder_id === id);
        return folder?.analysis_status !== "ready";
      });

      let nextSession = session;
      if (foldersToAnalyze.length > 0) {
        nextSession = await iconApi.analyzeFolders(session.session_id, foldersToAnalyze);
        applySession(nextSession);
      }

      setGenerateProgress((current) => current ? {
        ...current,
        stage: "applying_template",
      } : current);

      nextSession = await iconApi.applyTemplate(session.session_id, selectedTemplateId, folderIds);
      applySession(nextSession);

      for (let index = 0; index < folderIds.length; index += 1) {
        const folderId = folderIds[index];
        const folder = nextSession.folders.find((item) => item.folder_id === folderId) || targetFolders[index] || null;

        setGenerateProgress((current) => current ? {
          ...current,
          stage: "generating",
          completedFolders: index,
          currentFolderId: folderId,
          currentFolderName: folder?.folder_name || null,
        } : current);

        nextSession = await iconApi.generatePreviews(session.session_id, [folderId]);
        applySession(nextSession);
      }

      setGenerateProgress((current) => current ? {
        ...current,
        stage: "generating",
        completedFolders: totalFolders,
        currentFolderId: null,
        currentFolderName: null,
      } : current);
      setNotice(`已完成 ${totalFolders} 个目标文件夹的图标生成。`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "生成图标失败");
    } finally {
      setGenerateProgress(null);
    }
  };

  const reportClientAction = async (type: string, results: ApplyIconResult[]) => {
    if (!session) return;
    try {
      await iconApi.reportClientAction(session.session_id, {
        action_type: type,
        results,
        skipped_items: [],
      });
    } catch (reportError) {
      console.error("Report client action failed", reportError);
    }
  };

  const handleApplyVersion = async (folderId: string, version: IconPreviewVersion) => {
    if (!session || version.status !== "ready" || !desktopReady) return;

    setActiveProcessingId(folderId);
    setIsApplyingId(version.version_id);
    try {
      const folder = session.folders.find((item) => item.folder_id === folderId);
      if (!folder) return;

      const result = await invokeTauriCommand<string>("apply_folder_icon", {
        folderPath: folder.folder_path,
        imagePath: version.image_path,
      });

      const report: ApplyIconResult[] = [{
        folder_id: folderId,
        folder_name: folder.folder_name,
        folder_path: folder.folder_path,
        status: "applied",
        message: result || "应用成功",
      }];

      await reportClientAction("apply_icons", report);
      applySession(await iconApi.selectVersion(session.session_id, folderId, version.version_id));
      setLastAppliedFolderPath(folder.folder_path);
      setNotice(`「${folder.folder_name}」图标已应用。`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "应用图标失败");
    } finally {
      setActiveProcessingId(null);
      setIsApplyingId(null);
    }
  };

  const handleApplyBatch = async () => {
    if (!session || allFolderIds.length === 0 || !desktopReady) return;

    setBatchApplyLoading(true);
    try {
      const preparation = await iconApi.prepareApplyReady(session.session_id, allFolderIds);
      if (preparation.tasks.length === 0) {
        setNotice("没有可直接应用的就绪版本。");
        return;
      }

      const results = await invokeTauriCommand<ApplyIconResult[]>("apply_ready_icons", {
        tasks: preparation.tasks,
      });

      const appliedResults = results || [];
      await reportClientAction("apply_icons", appliedResults);
      applySession(await iconApi.scanSession(session.session_id));
      setNotice(`成功应用 ${appliedResults.filter((item) => item.status === "applied").length} 个目标文件夹图标。`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "批量应用失败");
    } finally {
      setBatchApplyLoading(false);
    }
  };

  const handleDeleteVersion = async (folderId: string, versionId: string) => {
    setSession(current => {
      if (!current) return current;
      const updatedFolders = current.folders.map(folder => {
        if (folder.folder_id === folderId) {
          let updatedCurrentVersion = folder.current_version_id;
          if (updatedCurrentVersion === versionId) {
            updatedCurrentVersion = null;
          }
          return {
            ...folder,
            current_version_id: updatedCurrentVersion,
            versions: folder.versions.filter(v => v.version_id !== versionId)
          };
        }
        return folder;
      });
      return { ...current, folders: updatedFolders };
    });
    setNotice("已废弃不满意的图标版本。");
  };

  const handleResetSession = useCallback(async () => {
    if (!session) return;
      setActionLabel("正在重置图标工作区...");
    try {
      const nextSession = await iconApi.updateTargets(session.session_id, { target_paths: [], mode: "replace" });
      applySession(nextSession);
      setSelectedTemplateId("");
      setResetConfirmOpen(false);
      setNotice("已清空所有目标文件夹。");
    } catch (err) {
      setError(err instanceof Error ? err.message : "重置失败");
    } finally {
      setActionLabel(null);
    }
  }, [applySession, iconApi, session]);

  const handleRemoveTarget = async (folderId: string) => {
    if (!session) return;
    const folder = session.folders.find((item) => item.folder_id === folderId);
    if (!folder) return;

    setActionLabel("正在移除目标文件夹...");
    try {
      const nextSession = await iconApi.removeTarget(session.session_id, folderId);
      applySession(nextSession);
      if (folderToRestore?.folder_id === folderId) {
        setRestoreConfirmOpen(false);
      }
      setNotice(`已将「${folder.folder_name}」移出本次目标。`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "移除目标文件夹失败");
    } finally {
      setActionLabel(null);
    }
  };

  const handleRestoreIcon = async () => {
    if (!folderToRestore || !desktopReady) return;

    try {
      await invokeTauriCommand("clear_folder_icon", { folderPath: folderToRestore.folder_path });
      setNotice(`「${folderToRestore.folder_name}」已还原为默认图标。`);
      setRestoreConfirmOpen(false);
    } catch {
      setError("还原图标失败");
    }
  };

  const handleGuidePrimaryAction = () => {
    if (!hasTargets) {
      void handleChooseTargets();
      return;
    }
    if (!hasSelectedStyle) {
      setStylePanelOpen(true);
      return;
    }
    void runGenerateFlow(allFolderIds);
  };

  const shouldShowNotice = useMemo(() => {
    if (!notice) return false;
    return !(
      notice.includes("已选择 ") ||
      notice.includes("已追加 ") ||
      notice.includes("已将「") && notice.includes("移出本次目标")
    );
  }, [notice]);

  const statusRail = (error || shouldShowNotice) ? (
    <div className="space-y-3 border-b border-on-surface/6 bg-surface-container-low/40 px-6 py-3 backdrop-blur-sm">
      {error ? <ErrorAlert message={error} onClose={() => setError(null)} /> : null}
      {shouldShowNotice ? (
        <div className="flex items-center gap-3 rounded-2xl border border-primary/15 bg-primary/5 px-4 py-3 text-[13px] text-primary">
          <p className="flex-1 font-bold">{notice}</p>
          {lastAppliedFolderPath && notice?.includes("图标已应用") && (
            <button 
              onClick={() => openDirectoryWithTauri(lastAppliedFolderPath)}
              className="flex items-center gap-2 rounded-lg bg-primary/10 px-3 py-1.5 text-[12px] font-black text-primary hover:bg-primary/20 transition-colors"
            >
              <FolderOpen className="h-3.5 w-3.5" />
              打开目录查看
            </button>
          )}
          <button onClick={() => {
            setNotice(null);
            setLastAppliedFolderPath(null);
          }} className="px-2 text-[12px] font-bold opacity-40 hover:opacity-100">关闭</button>
        </div>
      ) : null}
    </div>
  ) : null;

  const processingBanner = generatePresentation ? (
    <div className="border-b border-primary/15 bg-primary/8 px-6 py-4">
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 space-y-1">
            <div className="flex items-center gap-2.5 text-primary">
              <LoaderCircle className="h-4 w-4 animate-spin" />
              <p className="text-[14px] font-black tracking-tight">{generatePresentation.title}</p>
            </div>
            <p className="text-[12px] font-bold text-primary/70">{generatePresentation.detail} ...</p>
          </div>
          <div className="rounded-full border border-primary/20 bg-surface-container-lowest/80 px-3.5 py-1 text-[11px] font-black tabular-nums text-primary shadow-sm">
            {generateProgress?.completedFolders ?? 0} / {generateProgress?.totalFolders ?? 0}
          </div>
        </div>

        <div className="space-y-2.5">
          <div className="h-1.5 overflow-hidden rounded-full bg-primary/15">
            <div
              className="h-full rounded-full bg-primary shadow-[0_0_8px_rgba(var(--primary-rgb),0.4)] transition-all duration-700"
              style={{ width: `${generatePresentation.percent}%` }}
            />
          </div>
          <div className="flex flex-wrap gap-2.5">
            {generateStageSteps.map((step, index) => {
              const currentStage = generateProgress?.stage;
              const stageOrder: GenerateFlowStage[] = ["analyzing", "applying_template", "generating"];
              const currentIndex = currentStage ? stageOrder.indexOf(currentStage) : -1;
              const completed = currentIndex > index || (step.key === "generating" && (generateProgress?.completedFolders ?? 0) >= (generateProgress?.totalFolders ?? 0));
              const active = currentStage === step.key;

              return (
                <div
                  key={step.key}
                  className={cn(
                    "flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-black transition-all",
                    completed
                      ? "border-primary/20 bg-primary/15 text-primary shadow-sm"
                      : active
                        ? "border-primary/30 bg-surface-container-lowest text-primary shadow-md scale-105"
                        : "border-on-surface/8 bg-surface-container-low/50 text-ui-muted opacity-60",
                  )}
                >
                  {completed ? (
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  ) : active ? (
                    <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full border border-current/30 text-[9px] font-black">
                      {index + 1}
                    </span>
                  )}
                  <span className="tracking-tight">{step.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  ) : actionLabel ? (
    <div className="flex items-center gap-3 bg-primary/12 px-6 py-2.5 text-[12px] font-black text-primary border-b border-primary/10">
      <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
      <span>{actionLabel}</span>
    </div>
  ) : null;

  const renderEmptyState = () => (
    <div className="flex-1 px-6 py-12 lg:py-20">
      <div className="mx-auto flex max-w-[640px] flex-col items-center text-center">
        <div className="relative mb-8 flex h-20 w-20 items-center justify-center rounded-[14px] bg-primary/10 text-primary shadow-[0_12px_24px_-8px_rgba(var(--primary-rgb),0.3)]">
          <FolderPlus className="h-10 w-10" />
          <div className="absolute -right-2 -top-2 flex h-8 w-8 items-center justify-center rounded-full border-[3px] border-white bg-primary text-white shadow-sm">
            <Sparkles className="h-4 w-4" />
          </div>
        </div>
        
        <h2 className="mb-4 text-[2.2rem] font-black tracking-tight text-on-surface">还没有目标文件夹</h2>
        
        <div className="mb-10 space-y-4">
          <p className="text-[17px] font-bold text-on-surface/80">
            为目标文件夹生成可预览、可应用的图标方案。
          </p>
          <p className="mx-auto max-w-md text-[14px] leading-relaxed text-ui-muted opacity-80">
            选择目标文件夹和风格模板后，系统会根据文件夹名称与内容生成多版预览，确认后再应用到系统图标。
          </p>
        </div>

        <Button size="lg" onClick={handleChooseTargets} className="h-14 rounded-[8px] px-10 text-[16px] font-black shadow-[0_12px_24px_-4px_rgba(var(--primary-rgb),0.2)]">
          <FolderPlus className="mr-3 h-5.5 w-5.5" />
          选择目标文件夹
        </Button>
        
        <div className="mt-12 grid grid-cols-3 gap-6 border-t border-on-surface/6 pt-10">
          <div className="space-y-2">
            <p className="text-[12px] font-black uppercase tracking-[0.15em] text-primary/70">1. 选择目录</p>
            <p className="text-[12px] font-semibold text-ui-muted">一次支持多个文件夹</p>
          </div>
          <div className="space-y-2">
            <p className="text-[12px] font-black uppercase tracking-[0.15em] text-primary/70">2. 选择模板</p>
            <p className="text-[12px] font-semibold text-ui-muted">选定生成图标的风格模板</p>
          </div>
          <div className="space-y-2">
            <p className="text-[12px] font-black uppercase tracking-[0.15em] text-primary/70">3. 生成并应用</p>
            <p className="text-[12px] font-semibold text-ui-muted">先看预览，再决定是否应用</p>
          </div>
        </div>
      </div>
    </div>
  );

  if (!templatesInitialized && templatesLoading) {
    return (
      <div className="flex flex-1 items-center justify-center bg-surface">
        <div className="flex flex-col items-center gap-4">
          <LoaderCircle className="h-10 w-10 animate-spin text-primary/40" />
          <p className="text-[14px] font-bold text-on-surface">正在加载图标工作区...</p>
        </div>
      </div>
    );
  }

  if (restoringSession) {
    return (
      <div className="flex flex-1 items-center justify-center bg-surface">
        <div className="flex flex-col items-center gap-4">
          <LoaderCircle className="h-10 w-10 animate-spin text-primary/40" />
          <p className="text-[14px] font-bold text-on-surface">正在恢复图标工作区...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex flex-1 flex-col overflow-hidden bg-surface">
      <IconWorkbenchToolbar
        targetCount={targetCount}
        latestTargetPath={latestTargetPath}
        onAddTargets={handleChooseTargets}
        onClearTargets={() => setResetConfirmOpen(true)}
        onOpenStylePanel={() => setStylePanelOpen(true)}
        onOpenTemplateDrawer={() => setTemplateDrawerOpen(true)}
        selectedTemplateName={selectedTemplate?.name || "请先选择风格"}
      />

      {hasTargets ? (
        <IconWorkbenchGuideBar
          statusText={topStatusText}
          primaryCtaLabel={primaryCtaLabel}
          primaryActionKind={primaryActionKind}
          primaryCtaDisabled={isBusy}
          onPrimaryAction={handleGuidePrimaryAction}
        />
      ) : null}

      {statusRail}
      {processingBanner}

      {!isImageModelConfigured && (
        <div className="mx-6 my-4 flex items-center justify-between gap-4 rounded-[12px] border border-warning/20 bg-warning/6 p-4">
          <div className="flex items-center gap-3 text-warning">
            <AlertCircle className="h-5 w-5" />
            <div className="space-y-0.5">
              <p className="text-[13px] font-black text-on-surface">图标生成模型尚未配置</p>
              <p className="text-[12px] font-medium text-ui-muted">未完成配置前，暂时不能生成新的图标预览。请先到设置里补全信息。</p>
            </div>
          </div>
          <Link href="/settings">
            <Button variant="secondary" size="sm" className="font-bold">
              去配置
            </Button>
          </Link>
        </div>
      )}

      {!hasTargets ? (
        renderEmptyState()
      ) : (
        <IconWorkbenchFolderList
          folders={session?.folders || []}
          expandedFolderId={expandedFolderId}
          onToggleExpand={setExpandedFolderId}
          onSelectVersion={async (folderId, versionId) => {
            if (!session) return;
            applySession(await iconApi.selectVersion(session.session_id, folderId, versionId));
          }}
          onZoom={setPreviewVersion}
          onApplyVersion={handleApplyVersion}
          onRegenerate={(folderId) => void runGenerateFlow([folderId])}
          onRestore={(folderId) => {
            const folder = session?.folders.find((item) => item.folder_id === folderId);
            if (folder) {
              setFolderToRestore(folder);
              setRestoreConfirmOpen(true);
            }
          }}
          onRemoveTarget={(folderId) => void handleRemoveTarget(folderId)}
          onRemoveBg={(folderId, version) => void handleRemoveBg(folderId, version)}
          onDeleteVersion={(folderId, versionId) => void handleDeleteVersion(folderId, versionId)}
          processingBgVersionIds={processingBgVersionIds}
          baseUrl={baseUrl}
          apiToken={apiToken}
          isApplyingId={isApplyingId}
          activeProcessingId={activeProcessingId}
          desktopReady={desktopReady}
          hasSelectedStyle={hasSelectedStyle}
          isProcessing={isBusy}
          processingFolderId={generateProgress?.currentFolderId ?? null}
        />
      )}

      {hasTargets && hasSelectedStyle ? (
        <IconWorkbenchFooterBar
          targetCount={targetCount}
          isGenerating={isGeneratingFlow}
          generateProgressHint={generatePresentation?.detail || null}
          isApplying={batchApplyLoading}
          onGenerate={() => void runGenerateFlow(allFolderIds)}
          onApplyBatch={handleApplyBatch}
          canApplyBatch={canApplyBatch}
          onRemoveBgBatch={handleRemoveBgBatch}
          canRemoveBgBatch={canApplyBatch}
          isRemovingBgBatch={isRemovingBgBatch}
          selectedTemplateName={selectedTemplate?.name || null}
          generateBlockedReason={generateBlockedReason}
        />
      ) : null}

      <IconWorkbenchStylePanel
        isOpen={stylePanelOpen}
        onClose={() => setStylePanelOpen(false)}
        templates={templates}
        selectedTemplateId={selectedTemplateId}
        onSelect={setSelectedTemplateId}
        onRequestManageTemplate={(templateId) => {
          setSelectedTemplateId(templateId);
          setStylePanelOpen(false);
          setTemplateDrawerOpen(true);
        }}
      />

      <IconWorkbenchTemplateDrawer
        open={templateDrawerOpen}
        templates={templates}
        templatesLoading={templatesLoading}
        selectedTemplate={selectedTemplate}
        templateNameDraft={templateNameDraft}
        templateDescriptionDraft={templateDescriptionDraft}
        templatePromptDraft={templatePromptDraft}
        templateActionLoading={templateActionLoading}
        onClose={() => setTemplateDrawerOpen(false)}
        onSelectTemplate={setSelectedTemplateId}
        onTemplateNameChange={setTemplateNameDraft}
        onTemplateDescriptionChange={setTemplateDescriptionDraft}
        onTemplatePromptChange={setTemplatePromptDraft}
        onReloadTemplates={() => void reloadTemplates(selectedTemplateId)}
        onCreateTemplate={() => void createTemplate()}
        onUpdateTemplate={() => void updateTemplate()}
        onDeleteTemplate={() => void deleteTemplate()}
      />

      {previewVersion ? (
        <IconWorkbenchPreviewModal
          src={buildImageSrc(previewVersion, baseUrl, apiToken)}
          title={`版本预览 - v${previewVersion.version_number}`}
          subtitle={selectedTemplate?.name || "预览"}
          localImagePath={previewVersion.image_path}
          folderName={session?.folders.find(f => f.versions.some(v => v.version_id === previewVersion.version_id))?.folder_name}
          folderPath={session?.folders.find(f => f.versions.some(v => v.version_id === previewVersion.version_id))?.folder_path}
          isApplied={session?.folders.some(f => f.current_version_id === previewVersion.version_id)}
          onOpenFolder={openDirectoryWithTauri}
          onClose={() => setPreviewVersion(null)}
          onApply={() => {
            const folder = session?.folders.find(f => f.versions.some(v => v.version_id === previewVersion.version_id));
            if (folder) handleApplyVersion(folder.folder_id, previewVersion);
          }}
          onRegenerate={() => {
             const folder = session?.folders.find(f => f.versions.some(v => v.version_id === previewVersion.version_id));
             if (folder) runGenerateFlow([folder.folder_id]);
          }}
          isApplying={isApplyingId === previewVersion.version_id}
          imageModelName={workbenchConfig?.image_model.model || "默认模型"}
        />
      ) : null}

      <ConfirmDialog
        open={restoreConfirmOpen}
        title="还原默认图标？"
        description={`确定要将文件夹「${folderToRestore?.folder_name}」恢复为系统默认图标吗？`}
        onClose={() => setRestoreConfirmOpen(false)}
        onConfirm={() => void handleRestoreIcon()}
      />

      <ConfirmDialog
        open={resetConfirmOpen}
        title="重置工作台？"
        description="确定要清空当前所有目标文件夹吗？此操作不会删除任何文件或已生成的图标记录。"
        onClose={() => setResetConfirmOpen(false)}
        onConfirm={() => void handleResetSession()}
      />
    </div>
  );
}
