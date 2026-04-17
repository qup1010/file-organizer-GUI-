"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, FolderOpen, LoaderCircle } from "lucide-react";
import Link from "next/link";
import { motion } from "framer-motion";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ErrorAlert } from "@/components/ui/error-alert";
import { createApiClient } from "@/lib/api";
import { createIconWorkbenchApiClient } from "@/lib/icon-workbench-api";
import { createIconWorkbenchEventStream, type IconWorkbenchEventStream } from "@/lib/icon-workbench-sse";
import { getApiBaseUrl, getApiToken, invokeTauriCommand, isTauriDesktop, openDirectoryWithTauri, pickDirectoriesWithTauri } from "@/lib/runtime";
import { cn } from "@/lib/utils";
import type {
  ApplyIconResult,
  FolderIconCandidate,
  IconWorkbenchClientActionResult,
  IconWorkbenchConfig,
  IconWorkbenchEvent,
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
  buildGenerateFlowSteps,
  buildImageSrc,
  getGenerateFlowPresentation,
  isFolderReady,
  type GenerateFlowProgress,
} from "./icon-workbench-utils";
import { useBackgroundRemoval } from "./use-background-removal";
import { useIconTemplates } from "./use-icon-templates";

const APP_CONTEXT_EVENT = "file-organizer-context-change";
const ICONS_CONTEXT_KEY = "icons_header_context";
const ICONS_WORKSPACE_STATE_KEY = "icons_workspace_state";
type IconWorkbenchStreamStatus = "connecting" | "connected" | "reconnecting" | "offline";

interface PersistedIconsWorkspaceState {
  sessionId: string;
  selectedTemplateId: string;
  expandedFolderId: string | null;
}

interface NoticeState {
  message: string;
  detail: string | null;
}

export default function IconWorkbenchV2() {
  const baseUrl = getApiBaseUrl();
  const apiToken = getApiToken();
  const desktopReady = isTauriDesktop();
  const iconApi = useMemo(() => createIconWorkbenchApiClient(baseUrl, apiToken), [apiToken, baseUrl]);
  const systemApi = useMemo(() => createApiClient(baseUrl, apiToken), [apiToken, baseUrl]);

  const [session, setSession] = useState<IconWorkbenchSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<NoticeState | null>(null);
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
  const streamRef = useRef<IconWorkbenchEventStream | null>(null);
  const offlineTimerRef = useRef<number | null>(null);
  const noticeFadeTimerRef = useRef<number | null>(null);
  const noticeDismissTimerRef = useRef<number | null>(null);
  const hasConnectedRef = useRef(false);
  const [streamStatus, setStreamStatus] = useState<IconWorkbenchStreamStatus>("offline");
  const [isNoticeFading, setIsNoticeFading] = useState(false);

  const clearNoticeTimers = useCallback(() => {
    if (noticeFadeTimerRef.current !== null) {
      window.clearTimeout(noticeFadeTimerRef.current);
      noticeFadeTimerRef.current = null;
    }
    if (noticeDismissTimerRef.current !== null) {
      window.clearTimeout(noticeDismissTimerRef.current);
      noticeDismissTimerRef.current = null;
    }
  }, []);

  const showNotice = useCallback((message: string | null, detail?: string | null) => {
    clearNoticeTimers();
    setIsNoticeFading(false);
    if (!message) {
      setNotice(null);
      return;
    }
    setNotice({
      message,
      detail: detail?.trim() || null,
    });
  }, [clearNoticeTimers]);

  useEffect(() => {
    clearNoticeTimers();
    if (!notice?.message) {
      return;
    }
    if (!notice.message.includes("已恢复上次图标工作区")) {
      return;
    }
    noticeFadeTimerRef.current = window.setTimeout(() => {
      setIsNoticeFading(true);
      noticeFadeTimerRef.current = null;
    }, 2600);
    noticeDismissTimerRef.current = window.setTimeout(() => {
      setNotice((current) => (
        current?.message === notice.message ? null : current
      ));
      setIsNoticeFading(false);
      noticeDismissTimerRef.current = null;
    }, 2960);
    return () => {
      clearNoticeTimers();
    };
  }, [clearNoticeTimers, notice]);

  useEffect(() => {
    iconApi.getConfig().then((payload) => setWorkbenchConfig(payload.config)).catch(() => {
      setWorkbenchConfig(null);
    });
  }, [iconApi]);

  const isTextModelConfigured = useMemo(() => {
    if (!workbenchConfig) return true;
    const m = workbenchConfig.text_model;
    return Boolean(m?.configured ?? (m?.secret_state === "stored" && m?.model && m?.base_url));
  }, [workbenchConfig]);

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
  } = useIconTemplates({ iconApi, setError, showNotice });
  const {
    processingBgVersionIds,
    isRemovingBgBatch,
    batchProgress: removeBgBatchProgress,
    handleRemoveBg,
    handleRemoveBgBatch,
  } = useBackgroundRemoval({
    desktopReady,
    session,
    setSession,
    setError,
    showNotice,
  });

  const targetCount = session?.folders.length ?? 0;
  const hasTargets = targetCount > 0;
  const isGeneratingFlow = Boolean(generateProgress);
  const isBusy = Boolean(actionLabel) || isGeneratingFlow;
  const generatePresentation = useMemo(
    () => (generateProgress ? getGenerateFlowPresentation(generateProgress) : null),
    [generateProgress],
  );

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
  const canRemoveBgBatch = canApplyBatch;

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

  const clearOfflineTimer = useCallback(() => {
    if (offlineTimerRef.current !== null) {
      window.clearTimeout(offlineTimerRef.current);
      offlineTimerRef.current = null;
    }
  }, []);

  const scheduleOfflineState = useCallback(() => {
    clearOfflineTimer();
    offlineTimerRef.current = window.setTimeout(() => {
      setStreamStatus((current) => (current === "connected" ? current : "offline"));
    }, 5000);
  }, [clearOfflineTimer]);

  const closeEventStream = useCallback(() => {
    streamRef.current?.close();
    streamRef.current = null;
    hasConnectedRef.current = false;
    clearOfflineTimer();
  }, [clearOfflineTimer]);

  const handleWorkbenchEvent = useCallback((event: IconWorkbenchEvent) => {
    clearOfflineTimer();
    hasConnectedRef.current = true;
    setStreamStatus("connected");
    if (event.session_snapshot) {
      applySession(event.session_snapshot);
    }
    if (event.progress) {
      const progress = event.progress;
      const nextStage = (
        progress.stage === "analyzing"
        || progress.stage === "applying_template"
        || progress.stage === "generating"
      ) ? progress.stage : "generating";
      setGenerateProgress((current) => ({
        stage: nextStage,
        totalFolders: progress.totalFolders,
        completedFolders: progress.completedFolders,
        currentFolderId: progress.currentFolderId,
        currentFolderName: progress.currentFolderName,
        steps: current?.steps?.length ? current.steps : [nextStage],
      }));
    }
  }, [applySession, clearOfflineTimer]);

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
          if ((nextSession.folder_count ?? nextSession.folders.length) > 0) {
            showNotice("已恢复上次图标工作区，目标列表和展开状态已还原。");
          }
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
  }, [applySession, iconApi, setSelectedTemplateId, showNotice]);

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

  useEffect(() => {
    if (!session?.session_id) {
      closeEventStream();
      setStreamStatus("offline");
      return;
    }
    closeEventStream();
    setStreamStatus("connecting");
    scheduleOfflineState();
    streamRef.current = createIconWorkbenchEventStream({
      baseUrl,
      sessionId: session.session_id,
      accessToken: apiToken,
      onEvent: handleWorkbenchEvent,
      onError: () => {
        setStreamStatus(hasConnectedRef.current ? "reconnecting" : "connecting");
        scheduleOfflineState();
      },
    });
    return closeEventStream;
  }, [apiToken, baseUrl, closeEventStream, handleWorkbenchEvent, scheduleOfflineState, session?.session_id]);

  const generationConfigBlockedReason = !isTextModelConfigured
    ? "请先在设置中配置文本模型，图标工坊需要先分析文件夹内容。"
    : !isImageModelConfigured
      ? "请先在设置中配置图标生成模型，才能生成新的预览。"
      : null;
  const generateBlockedReason = !hasTargets
    ? "先选择目标文件夹"
    : !hasSelectedStyle
      ? "先选择一个风格模板"
      : generationConfigBlockedReason
        ? generationConfigBlockedReason
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
      showNotice(session
        ? `已追加 ${nextTargetPaths.length} 个目标文件夹，当前共 ${nextSession.folder_count} 个。`
        : `已选择 ${nextSession.folder_count} 个目标文件夹。`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "选择目标文件夹失败");
    } finally {
      setActionLabel(null);
    }
  }, [applySession, desktopReady, iconApi, session, showNotice, systemApi]);

  const runGenerateFlow = async (folderIds: string[]) => {
    if (!session || folderIds.length === 0) return;
    if (!isTextModelConfigured) {
      setError("请先在设置中配置文本模型，然后再生成图标预览。");
      return;
    }
    if (!isImageModelConfigured) {
      setError("请先在设置中配置图标生成模型，然后再生成图标预览。");
      return;
    }
    if (!selectedTemplateId) {
      setError("请先选择一个风格模板。");
      return;
    }

    const targetFolders = folderIds
      .map((folderId) => session.folders.find((folder) => folder.folder_id === folderId))
      .filter((folder): folder is FolderIconCandidate => Boolean(folder));
    const versionCountsBeforeGenerate = new Map(
      targetFolders.map((folder) => [folder.folder_id, folder.versions.length]),
    );
    const foldersToAnalyze = folderIds.filter((id) => {
      const folder = session.folders.find((item) => item.folder_id === id);
      return folder?.analysis_status !== "ready";
    });
    const generateSteps = buildGenerateFlowSteps(foldersToAnalyze.length > 0);

    const totalFolders = targetFolders.length || folderIds.length;
    setError(null);
    setGenerateProgress({
      stage: generateSteps[0],
      totalFolders,
      completedFolders: 0,
      currentFolderId: null,
      currentFolderName: null,
      steps: generateSteps,
    });

    try {
      let nextSession = session;
      if (foldersToAnalyze.length > 0) {
        setGenerateProgress({
          stage: "analyzing",
          totalFolders: foldersToAnalyze.length,
          completedFolders: 0,
          currentFolderId: null,
          currentFolderName: null,
          steps: generateSteps,
        });
        nextSession = await iconApi.analyzeFolders(session.session_id, foldersToAnalyze);
        applySession(nextSession);
      }

      setGenerateProgress({
        stage: "applying_template",
        totalFolders,
        completedFolders: 0,
        currentFolderId: null,
        currentFolderName: null,
        steps: generateSteps,
      });

      nextSession = await iconApi.applyTemplate(session.session_id, selectedTemplateId, folderIds);
      applySession(nextSession);

      setGenerateProgress({
        stage: "generating",
        totalFolders,
        completedFolders: 0,
        currentFolderId: null,
        currentFolderName: null,
        steps: generateSteps,
      });
      nextSession = await iconApi.generatePreviews(session.session_id, folderIds);
      applySession(nextSession);
      const generatedFolders = folderIds
        .map((folderId) => nextSession.folders.find((folder) => folder.folder_id === folderId))
        .filter((folder): folder is FolderIconCandidate => Boolean(folder));
      const generationSummary = generatedFolders.reduce(
        (summary, folder) => {
          const previousVersionCount = versionCountsBeforeGenerate.get(folder.folder_id) ?? 0;
          const latestVersion = [...folder.versions].sort((a, b) => b.version_number - a.version_number)[0];
          if (folder.versions.length <= previousVersionCount || !latestVersion || latestVersion.version_number <= previousVersionCount) {
            summary.skipped += 1;
            return summary;
          }
          if (latestVersion.status === "ready") {
            summary.success += 1;
            return summary;
          }
          if (latestVersion.status === "error") {
            summary.failed += 1;
            return summary;
          }
          summary.skipped += 1;
          return summary;
        },
        { success: 0, failed: 0, skipped: 0 },
      );
      const failedFolders = generatedFolders
        .filter((folder) => {
          const previousVersionCount = versionCountsBeforeGenerate.get(folder.folder_id) ?? 0;
          const latestVersion = [...folder.versions].sort((a, b) => b.version_number - a.version_number)[0];
          return Boolean(
            latestVersion
            && folder.versions.length > previousVersionCount
            && latestVersion.version_number > previousVersionCount
            && latestVersion.status === "error",
          );
        })
        .map((folder) => folder.folder_name);
      const skippedFolders = generatedFolders
        .filter((folder) => {
          const previousVersionCount = versionCountsBeforeGenerate.get(folder.folder_id) ?? 0;
          const latestVersion = [...folder.versions].sort((a, b) => b.version_number - a.version_number)[0];
          return !latestVersion
            || folder.versions.length <= previousVersionCount
            || latestVersion.version_number <= previousVersionCount;
        })
        .map((folder) => folder.folder_name);
      let noticeDetail: string | null = null;
      if (failedFolders.length > 0) {
        const visible = failedFolders.slice(0, 2).map((name) => `「${name}」`).join("、");
        const remaining = failedFolders.length - Math.min(failedFolders.length, 2);
        noticeDetail = remaining > 0
          ? `生成失败：${visible}，以及另外 ${remaining} 个目标。`
          : `生成失败：${visible}。`;
      } else if (skippedFolders.length > 0) {
        const visible = skippedFolders.slice(0, 2).map((name) => `「${name}」`).join("、");
        const remaining = skippedFolders.length - Math.min(skippedFolders.length, 2);
        noticeDetail = remaining > 0
          ? `已跳过：${visible}，以及另外 ${remaining} 个目标。`
          : `已跳过：${visible}。`;
      }
      showNotice(
        `图标生成已完成：成功 ${generationSummary.success}，失败 ${generationSummary.failed}，跳过 ${generationSummary.skipped}。`,
        noticeDetail,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "生成图标失败");
    } finally {
      setGenerateProgress(null);
    }
  };

  const reportClientAction = async (
    type: string,
    results: IconWorkbenchClientActionResult[],
    skippedItems: IconWorkbenchClientActionResult[] = [],
  ) => {
    if (!session) return;
    try {
      return await iconApi.reportClientAction(session.session_id, {
        action_type: type,
        results,
        skipped_items: skippedItems,
      });
    } catch (reportError) {
      console.error("Report client action failed", reportError);
      return null;
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
        version_id: version.version_id,
        status: "applied",
        message: result || "应用成功",
      }];

      try {
        const selectedSession = await iconApi.selectVersion(session.session_id, folderId, version.version_id);
        applySession(selectedSession);
      } catch (selectionError) {
        console.error("Select applied version failed", selectionError);
      }

      const reportedSession = await reportClientAction("apply_icons", report);
      let syncedViaFallback = false;
      let syncFailed = false;
      if (reportedSession) {
        applySession(reportedSession);
      } else {
        try {
          applySession(await iconApi.scanSession(session.session_id));
          syncedViaFallback = true;
        } catch (scanError) {
          console.error("Rescan after apply failed", scanError);
          syncFailed = true;
        }
      }
      setLastAppliedFolderPath(folder.folder_path);
      showNotice(
        syncFailed
          ? `「${folder.folder_name}」图标已应用，但工作区状态暂未同步，请重新进入工作区确认。`
          : syncedViaFallback
            ? `「${folder.folder_name}」图标已应用，工作区状态已重新同步。`
            : `「${folder.folder_name}」图标已应用。`,
      );
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
        showNotice("没有可直接应用的就绪版本。");
        return;
      }

      const results = await invokeTauriCommand<ApplyIconResult[]>("apply_ready_icons", {
        tasks: preparation.tasks,
      });

      const taskVersions = new Map(
        preparation.tasks.map((task) => [task.folder_id || task.folder_path, task.version_id]),
      );
      const appliedResults = (results || []).map((item) => ({
        ...item,
        version_id: item.folder_id ? taskVersions.get(item.folder_id) || item.version_id : item.version_id,
      }));
      const reportedSession = await reportClientAction("apply_icons", appliedResults, preparation.skipped_items);
      if (reportedSession) {
        applySession(reportedSession);
      } else {
        applySession(await iconApi.scanSession(session.session_id));
      }
      showNotice(
        reportedSession?.last_client_action?.summary.message
          || `应用图标已完成：成功 ${appliedResults.filter((item) => item.status === "applied").length}，失败 ${appliedResults.filter((item) => item.status === "failed").length}，跳过 ${preparation.skipped_items.length}。`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "批量应用失败");
    } finally {
      setBatchApplyLoading(false);
    }
  };

  const handleDeleteVersion = async (folderId: string, versionId: string) => {
    if (!session) return;
    setActionLabel("正在删除图标版本...");
    try {
      const nextSession = await iconApi.deleteVersion(session.session_id, folderId, versionId);
      applySession(nextSession);
      showNotice("已删除该图标版本。");
    } catch (err) {
      setError(err instanceof Error ? err.message : "删除图标版本失败");
    } finally {
      setActionLabel(null);
    }
  };

  const handleResetSession = useCallback(async () => {
    if (!session) return;
      setActionLabel("正在重置图标工作区...");
    try {
      const nextSession = await iconApi.updateTargets(session.session_id, { target_paths: [], mode: "replace" });
      applySession(nextSession);
      setSelectedTemplateId("");
      setResetConfirmOpen(false);
      showNotice("已清空所有目标文件夹。");
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
      showNotice(`已将「${folder.folder_name}」移出本次目标。`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "移除目标文件夹失败");
    } finally {
      setActionLabel(null);
    }
  };

  const handleRestoreIcon = async () => {
    if (!folderToRestore || !desktopReady || !session) return;

    try {
      await invokeTauriCommand("restore_last_folder_icon", { folderPath: folderToRestore.folder_path });
      const reportedSession = await reportClientAction("restore_icons", [{
        folder_id: folderToRestore.folder_id,
        folder_name: folderToRestore.folder_name,
        folder_path: folderToRestore.folder_path,
        status: "restored",
        message: "已恢复上一次图标状态",
      }]);
      let syncedViaFallback = false;
      let syncFailed = false;
      if (reportedSession) {
        applySession(reportedSession);
      } else {
        try {
          applySession(await iconApi.scanSession(session.session_id));
          syncedViaFallback = true;
        } catch (scanError) {
          console.error("Rescan after restore failed", scanError);
          syncFailed = true;
        }
      }
      setLastAppliedFolderPath(null);
      showNotice(
        syncFailed
          ? `「${folderToRestore.folder_name}」已恢复上一次图标状态，但工作区状态暂未同步，请重新进入工作区确认。`
          : syncedViaFallback
            ? `「${folderToRestore.folder_name}」已恢复上一次图标状态，工作区状态已重新同步。`
            : `「${folderToRestore.folder_name}」已恢复上一次图标状态。`,
      );
      setRestoreConfirmOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "恢复图标失败");
    }
  };

  const retryEventStream = useCallback(async () => {
    if (!session?.session_id) {
      return;
    }
    closeEventStream();
    setStreamStatus("connecting");
    scheduleOfflineState();
    streamRef.current = createIconWorkbenchEventStream({
      baseUrl,
      sessionId: session.session_id,
      accessToken: apiToken,
      onEvent: handleWorkbenchEvent,
      onError: () => {
        setStreamStatus(hasConnectedRef.current ? "reconnecting" : "connecting");
        scheduleOfflineState();
      },
    });
    try {
      applySession(await iconApi.getSession(session.session_id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "重新连接图标工作区失败。");
    }
  }, [apiToken, applySession, baseUrl, closeEventStream, handleWorkbenchEvent, iconApi, scheduleOfflineState, session?.session_id]);

  const shouldShowNotice = useMemo(() => {
    if (!notice?.message) return false;
    return !(
      notice.message.includes("已选择 ") ||
      notice.message.includes("已追加 ") ||
      (notice.message.includes("已将「") && notice.message.includes("移出本次目标"))
    );
  }, [notice]);

  const statusRail = (error || shouldShowNotice || generationConfigBlockedReason || streamStatus !== "connected") ? (
    <div className="space-y-3 border-b border-on-surface/6 bg-surface-container-low/40 px-6 py-3 backdrop-blur-sm">
      {error ? <ErrorAlert message={error} onClose={() => setError(null)} /> : null}

      {streamStatus !== "connected" && session ? (
        <div className={cn(
          "flex items-center justify-between gap-4 rounded-[12px] border p-3 shadow-sm",
          streamStatus === "offline"
            ? "border-on-surface/10 bg-surface-container-lowest text-ui-muted"
            : "border-warning/15 bg-warning/[0.04] text-warning",
        )}>
          <div className="flex items-center gap-3">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <p className="text-[12px] font-bold leading-tight text-on-surface">
              {streamStatus === "connecting"
                ? "正在连接图标工坊实时状态..."
                : streamStatus === "reconnecting"
                  ? "图标工坊连接短暂中断，正在尝试重连。后台任务可能仍在继续。"
                  : "图标工坊实时连接已断开，当前进度可能不是最新状态。"}
            </p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            className="h-7 rounded-[6px] px-3 text-[10px] font-black"
            onClick={() => void retryEventStream()}
          >
            重新连接
          </Button>
        </div>
      ) : null}
      
      {generationConfigBlockedReason && (
        <div className="flex items-center justify-between gap-4 rounded-[12px] border border-warning/15 bg-warning/[0.04] p-3 backdrop-blur-sm shadow-sm animate-in fade-in slide-in-from-top-1 duration-300">
           <div className="flex items-center gap-3 text-warning">
             <AlertCircle className="h-4 w-4 shrink-0" />
             <p className="text-[12px] font-bold text-on-surface leading-tight">
               {generationConfigBlockedReason}
             </p>
           </div>
           <Link href="/settings">
             <Button variant="secondary" size="sm" className="h-7 font-black rounded-[6px] px-3 text-[10px] bg-warning/10 border-warning/20 hover:bg-warning/20 text-warning transition-colors">去配置</Button>
           </Link>
        </div>
      )}

      {shouldShowNotice ? (
        <div className={cn(
          "flex items-center gap-3 rounded-[12px] border border-primary/15 bg-primary/5 px-4 py-3 text-[13px] text-primary transition-all duration-300 ease-out",
          isNoticeFading ? "translate-y-[-4px] opacity-0" : "translate-y-0 opacity-100",
        )}>
          <div className="min-w-0 flex-1">
            <p className="font-bold">{notice?.message}</p>
            {notice?.detail ? (
              <p className="mt-1 text-[12px] font-medium text-primary/75">{notice.detail}</p>
            ) : null}
          </div>
          {lastAppliedFolderPath && notice?.message.includes("图标已应用") && (
            <button 
              onClick={() => openDirectoryWithTauri(lastAppliedFolderPath)}
              className="flex items-center gap-2 rounded-[8px] bg-primary/10 px-3 py-1.5 text-[12px] font-black text-primary hover:bg-primary/20 transition-colors"
            >
              <FolderOpen className="h-3.5 w-3.5" />
              打开目录查看
            </button>
          )}
          <button onClick={() => {
            showNotice(null);
            setLastAppliedFolderPath(null);
          }} className="px-2 text-[12px] font-bold opacity-40 hover:opacity-100">关闭</button>
        </div>
      ) : null}
    </div>
  ) : null;

  const processingBanner = generatePresentation ? (
    <div className="border-b border-primary/12 bg-primary/6 px-6 py-2.5">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <LoaderCircle className="h-4 w-4 shrink-0 animate-spin text-primary" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <p className="text-[13px] font-black tracking-tight text-primary">{generatePresentation.title}</p>
              <p className="truncate text-[11px] font-bold text-primary/70">{generatePresentation.detail}</p>
            </div>
          </div>
          <div className="rounded-full border border-primary/18 bg-surface-container-lowest/80 px-3 py-0.5 text-[11px] font-black tabular-nums text-primary shadow-sm">
            {generatePresentation.counter}
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="h-1 overflow-hidden rounded-full bg-primary/12">
            <div
              className="h-full rounded-full bg-primary transition-all duration-500"
              style={{ width: `${generatePresentation.percent}%` }}
            />
          </div>
          {generatePresentation.steps.length > 1 ? (
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold">
              {generatePresentation.steps.map((step, index) => {
                const currentStage = generateProgress?.stage;
                const currentIndex = generatePresentation.steps.findIndex((item) => item.key === currentStage);
                const completed = currentIndex > index
                  || (step.key === "generating" && (generateProgress?.completedFolders ?? 0) >= (generateProgress?.totalFolders ?? 0));
                const active = currentStage === step.key;

                return (
                  <React.Fragment key={step.key}>
                    <span
                      className={cn(
                        completed ? "text-primary" : active ? "text-primary/85" : "text-ui-muted/80",
                      )}
                    >
                      {step.label}
                    </span>
                    {index < generatePresentation.steps.length - 1 ? (
                      <span className="text-primary/25">/</span>
                    ) : null}
                  </React.Fragment>
                );
              })}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  ) : actionLabel ? (
    <div className="flex items-center gap-3 bg-primary/12 px-6 py-2.5 text-[12px] font-black text-primary border-b border-primary/10">
      <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
      <span>{actionLabel}</span>
    </div>
  ) : null;

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
    <div className="relative flex h-full w-full antialiased bg-surface overflow-hidden">
      <div className="flex flex-1 flex-col overflow-hidden bg-surface">
        <IconWorkbenchToolbar
          targetCount={targetCount}
          latestTargetPath={latestTargetPath}
          onAddTargets={handleChooseTargets}
          onClearTargets={() => setResetConfirmOpen(true)}
          onOpenStylePanel={() => setStylePanelOpen(true)}
          onOpenTemplateDrawer={() => setTemplateDrawerOpen(true)}
          selectedTemplateName={selectedTemplate?.name || "请选择风格"}
        />

        {statusRail}
        {processingBanner}

        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
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
                generateBlockedReason={generationConfigBlockedReason}
                isProcessing={isBusy}
                processingFolderId={generateProgress?.currentFolderId ?? null}
                onAddTargets={handleChooseTargets}
             />
        </div>
      </div>

      {hasTargets && (hasSelectedStyle || canApplyBatch || canRemoveBgBatch) ? (
        <IconWorkbenchFooterBar
          targetCount={targetCount}
          isGenerating={isGeneratingFlow}
          generateProgressHint={generatePresentation?.detail || null}
          isApplying={batchApplyLoading}
          onGenerate={() => void runGenerateFlow(allFolderIds)}
          onApplyBatch={handleApplyBatch}
          canApplyBatch={canApplyBatch}
          onRemoveBgBatch={handleRemoveBgBatch}
          canRemoveBgBatch={canRemoveBgBatch}
          isRemovingBgBatch={isRemovingBgBatch}
          removeBgBatchProgress={removeBgBatchProgress}
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
          folderName={session?.folders.find((f) => f.versions.some((v) => v.version_id === previewVersion.version_id))?.folder_name}
          folderPath={session?.folders.find((f) => f.versions.some((v) => v.version_id === previewVersion.version_id))?.folder_path}
          isApplied={Boolean(session?.folders.find((f) => f.versions.some((v) => v.version_id === previewVersion.version_id))?.applied_version_id === previewVersion.version_id)}
          isCurrentVersion={Boolean(session?.folders.find((f) => f.versions.some((v) => v.version_id === previewVersion.version_id))?.current_version_id === previewVersion.version_id)}
          onOpenFolder={openDirectoryWithTauri}
          onClose={() => setPreviewVersion(null)}
          onApply={() => {
            const folder = session?.folders.find((f) => f.versions.some((v) => v.version_id === previewVersion.version_id));
            if (folder) handleApplyVersion(folder.folder_id, previewVersion);
          }}
          onRegenerate={() => {
             const folder = session?.folders.find((f) => f.versions.some((v) => v.version_id === previewVersion.version_id));
             if (folder) runGenerateFlow([folder.folder_id]);
          }}
          regenerateDisabled={Boolean(generationConfigBlockedReason) || isBusy}
          isApplying={isApplyingId === previewVersion.version_id}
          imageModelName={workbenchConfig?.image_model.model || "默认模型"}
        />
      ) : null}

      <ConfirmDialog
        open={restoreConfirmOpen}
        title="恢复上一次图标状态？"
        description={`确定要将文件夹「${folderToRestore?.folder_name}」恢复到进入图标工坊前的最近一次图标状态吗？`}
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

