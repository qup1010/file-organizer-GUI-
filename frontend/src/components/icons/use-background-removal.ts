"use client";

import { useCallback, useMemo, useState, type Dispatch, type SetStateAction } from "react";

import { createApiClient } from "@/lib/api";
import { getApiBaseUrl, getApiToken, invokeTauriCommand, waitForRuntimeConfig } from "@/lib/runtime";
import type { IconPreviewVersion, IconWorkbenchSession } from "@/types/icon-workbench";

interface UseBackgroundRemovalOptions {
  desktopReady: boolean;
  session: IconWorkbenchSession | null;
  setSession: Dispatch<SetStateAction<IconWorkbenchSession | null>>;
  setError: Dispatch<SetStateAction<string | null>>;
  setNotice: Dispatch<SetStateAction<string | null>>;
}

export function useBackgroundRemoval({
  desktopReady,
  session,
  setSession,
  setError,
  setNotice,
}: UseBackgroundRemovalOptions) {
  const api = useMemo(() => createApiClient(getApiBaseUrl(), getApiToken()), []);
  const [processingBgVersionIds, setProcessingBgVersionIds] = useState<Set<string>>(new Set());
  const [isRemovingBgBatch, setIsRemovingBgBatch] = useState(false);

  const loadBgRemovalRuntime = useCallback(async () => {
    return api.getSettingsRuntime<{
      model_id: string;
      api_type: string;
      payload_template: string;
      api_token?: string | null;
    }>("bg_removal");
  }, [api]);

  const handleRemoveBg = useCallback(async (folderId: string, version: IconPreviewVersion) => {
    if (!desktopReady || !session) {
      setError("抠图功能目前仅支持桌面端。");
      return;
    }

    const processingKey = `${folderId}-${version.version_id}`;
    setProcessingBgVersionIds((prev) => new Set(prev).add(processingKey));

    try {
      const runtime = await waitForRuntimeConfig();
      const runtimeConfig = await loadBgRemovalRuntime();
      const processedB64 = await invokeTauriCommand<string>("remove_background_for_image", {
        imagePath: version.image_path,
        config: {
          modelId: runtimeConfig.model_id,
          apiType: runtimeConfig.api_type,
          payloadTemplate: runtimeConfig.payload_template,
          apiToken: runtimeConfig.api_token ?? null,
        },
      });

      if (!processedB64) {
        throw new Error("移除背景返回的结果为空");
      }

      // decode base64
      const base64Data = processedB64.includes(",") ? processedB64.split(",")[1] : processedB64;
      const binaryString = atob(base64Data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      const response = await fetch(
        `${runtime.base_url?.trim() || getApiBaseUrl()}/api/icon-workbench/sessions/${session.session_id}/folders/${folderId}/versions/${version.version_id}/add-processed?suffix=nobg`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/octet-stream",
            "Authorization": `Bearer ${runtime.api_token?.trim() || getApiToken()}`,
            "x-file-organizer-token": runtime.api_token?.trim() || getApiToken(),
          },
          body: bytes,
        }
      );

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.detail || "注册新版本失败");
      }

      const result = await response.json();
      if (result.session) {
        setSession(result.session);
      }

      setNotice(`已基于 v${version.version_number} 生成了移除背景的新版本。`);
    } catch (err) {
      console.error("抠图异常详情 (Trace):", err);
      const isNetworkError = err instanceof TypeError && err.message === "Failed to fetch";
      const errorMsg = isNetworkError 
        ? "Failed to fetch (无法连接至本地服务，请确认后端 API 是否连接正常且 Token 正确)" 
        : (err instanceof Error ? err.message : String(err));
      
      setError(`抠图失败: ${errorMsg}`);
    } finally {
      setProcessingBgVersionIds((prev) => {
        const next = new Set(prev);
        next.delete(processingKey);
        return next;
      });
    }
  }, [desktopReady, loadBgRemovalRuntime, session, setError, setNotice, setSession]);

  const handleRemoveBgBatch = useCallback(async () => {
    if (!session || session.folders.length === 0 || !desktopReady) {
      return;
    }

    setIsRemovingBgBatch(true);
    let successCount = 0;
    try {
      for (const folder of session.folders) {
        if (!folder.current_version_id) {
          continue;
        }
        const version = folder.versions.find(
          (item) => item.version_id === folder.current_version_id && item.status === "ready",
        );
        if (!version) {
          continue;
        }
        try {
          await handleRemoveBg(folder.folder_id, version);
          successCount += 1;
        } catch (error) {
          console.error(error);
        }
      }
      if (successCount > 0) {
        setNotice(`成功为 ${successCount} 个就绪版本移除背景。`);
      }
    } finally {
      setIsRemovingBgBatch(false);
    }
  }, [desktopReady, handleRemoveBg, session, setNotice]);

  return {
    processingBgVersionIds,
    isRemovingBgBatch,
    handleRemoveBg,
    handleRemoveBgBatch,
  };
}
