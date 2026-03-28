"use client";

import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from "react";

import { invokeTauriCommand } from "@/lib/runtime";
import type { IconPreviewVersion, IconWorkbenchSession } from "@/types/icon-workbench";

const HF_BG_TOKEN_STORAGE_KEY = "file_organizer__hf_bg_token";
const HF_BG_TOKEN_LEGACY_STORAGE_KEY = "hf_bg_token";

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
  const [bgApiToken, setBgApiToken] = useState("");
  const [processingBgVersionIds, setProcessingBgVersionIds] = useState<Set<string>>(new Set());
  const [isRemovingBgBatch, setIsRemovingBgBatch] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const namespacedToken = window.localStorage.getItem(HF_BG_TOKEN_STORAGE_KEY);
    const legacyToken = window.localStorage.getItem(HF_BG_TOKEN_LEGACY_STORAGE_KEY);
    const savedToken = namespacedToken || legacyToken;
    if (savedToken) {
      setBgApiToken(savedToken);
      if (!namespacedToken) {
        window.localStorage.setItem(HF_BG_TOKEN_STORAGE_KEY, savedToken);
      }
    }
    if (legacyToken) {
      window.localStorage.removeItem(HF_BG_TOKEN_LEGACY_STORAGE_KEY);
    }
  }, []);

  const handleBgApiTokenChange = useCallback((token: string) => {
    setBgApiToken(token);
    if (typeof window === "undefined") {
      return;
    }
    if (token.trim()) {
      window.localStorage.setItem(HF_BG_TOKEN_STORAGE_KEY, token);
    } else {
      window.localStorage.removeItem(HF_BG_TOKEN_STORAGE_KEY);
    }
  }, []);

  const handleRemoveBg = useCallback(async (folderId: string, version: IconPreviewVersion) => {
    if (!desktopReady) {
      setError("抠图功能目前仅支持桌面端。");
      return;
    }

    const processingKey = `${folderId}-${version.version_id}`;
    setProcessingBgVersionIds((prev) => new Set(prev).add(processingKey));

    try {
      await invokeTauriCommand("remove_background_for_image", {
        imagePath: version.image_path,
        apiToken: bgApiToken || null,
      });

      setSession((current) => {
        if (!current) {
          return current;
        }
        const updatedFolders = current.folders.map((folder) => {
          if (folder.folder_id !== folderId) {
            return folder;
          }
          const updatedVersions = folder.versions.map((item) => {
            if (item.version_id !== version.version_id) {
              return item;
            }
            const url = new URL(item.image_url.startsWith("/") ? `http://dummy${item.image_url}` : item.image_url);
            url.searchParams.set("t", Date.now().toString());
            const finalUrl = item.image_url.startsWith("/") ? `${url.pathname}${url.search}` : url.toString();
            return { ...item, image_url: finalUrl };
          });
          return { ...folder, versions: updatedVersions };
        });
        return { ...current, folders: updatedFolders };
      });

      setNotice(`版本 v${version.version_number} 已成功移除背景。`);
    } catch (err) {
      setError(`抠图失败: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setProcessingBgVersionIds((prev) => {
        const next = new Set(prev);
        next.delete(processingKey);
        return next;
      });
    }
  }, [bgApiToken, desktopReady, setError, setNotice, setSession]);

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
    bgApiToken,
    handleBgApiTokenChange,
    processingBgVersionIds,
    isRemovingBgBatch,
    handleRemoveBg,
    handleRemoveBgBatch,
  };
}
