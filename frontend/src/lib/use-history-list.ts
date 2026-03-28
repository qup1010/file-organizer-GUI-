"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { createApiClient } from "@/lib/api";
import { getApiBaseUrl, getApiToken } from "@/lib/runtime";
import type { HistoryItem } from "@/types/session";

export type HistoryFilter = "all" | "active" | "completed" | "rolled_back";

export function isHistorySessionEntry(entry: HistoryItem): boolean {
  return entry.is_session || !["success", "completed", "rolled_back", "partial_failure"].includes(entry.status);
}

export function getHistoryEntryName(entry: HistoryItem): string {
  return entry.target_dir.replace(/[\\/]$/, "").split(/[\\/]/).pop() || "未命名记录";
}

function filterHistoryEntries(history: HistoryItem[], query: string, filter: HistoryFilter) {
  const keyword = query.trim().toLowerCase();

  return history.filter((entry) => {
    const isSession = isHistorySessionEntry(entry);
    const matchesFilter =
      filter === "all"
        ? true
        : filter === "active"
          ? isSession
          : filter === "completed"
            ? !isSession && entry.status !== "rolled_back"
            : entry.status === "rolled_back";

    if (!matchesFilter) {
      return false;
    }

    if (!keyword) {
      return true;
    }

    const name = getHistoryEntryName(entry);
    return [entry.target_dir, name, entry.status, entry.execution_id].some((value) =>
      value.toLowerCase().includes(keyword),
    );
  });
}

function toErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export function useHistoryList({ autoLoad = true }: { autoLoad?: boolean } = {}) {
  const api = useMemo(() => createApiClient(getApiBaseUrl(), getApiToken()), []);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(autoLoad);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<HistoryFilter>("all");
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadHistory = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getHistory();
      setHistory(data);
      return data;
    } catch (err) {
      setError(toErrorMessage(err, "读取历史记录失败"));
      return null;
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    if (autoLoad) {
      void loadHistory();
    }
  }, [autoLoad, loadHistory]);

  const filteredHistory = useMemo(
    () => filterHistoryEntries(history, query, filter),
    [filter, history, query],
  );

  const requestDelete = useCallback((id: string) => {
    setPendingDeleteId(id);
  }, []);

  const cancelDelete = useCallback(() => {
    setPendingDeleteId(null);
  }, []);

  const confirmDelete = useCallback(async () => {
    if (!pendingDeleteId) {
      return null;
    }

    setDeletingId(pendingDeleteId);
    setError(null);
    try {
      await api.deleteHistoryEntry(pendingDeleteId);
      const deletedId = pendingDeleteId;
      setHistory((prev) => prev.filter((entry) => entry.execution_id !== deletedId));
      setPendingDeleteId(null);
      return deletedId;
    } catch (err) {
      setError(toErrorMessage(err, "删除记录时发生错误"));
      return null;
    } finally {
      setDeletingId(null);
    }
  }, [api, pendingDeleteId]);

  return {
    api,
    history,
    setHistory,
    loading,
    error,
    setError,
    query,
    setQuery,
    filter,
    setFilter,
    filteredHistory,
    pendingDeleteId,
    deletingId,
    requestDelete,
    cancelDelete,
    confirmDelete,
    loadHistory,
  };
}
