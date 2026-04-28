import { describe, expect, it } from "vitest";

import type { HistoryItem } from "@/types/session";

import {
  getHistoryEntryHref,
  getHistoryEntryName,
  getHistoryEntryReadonlyHref,
  getHistoryEntrySummary,
  isHistorySessionEntry,
} from "./use-history-list";

function createHistoryItem(overrides: Partial<HistoryItem>): HistoryItem {
  return {
    execution_id: "entry-1",
    target_dir: "D:/incoming",
    status: "planning",
    created_at: "2026-04-21T00:00:00Z",
    is_session: true,
    item_count: 0,
    failure_count: 0,
    ...overrides,
  };
}

describe("use-history-list helpers", () => {
  it("treats only unfinished records as session entries", () => {
    expect(isHistorySessionEntry(createHistoryItem({ status: "planning", is_session: true }))).toBe(true);
    expect(isHistorySessionEntry(createHistoryItem({ status: "completed", is_session: false }))).toBe(false);
    expect(isHistorySessionEntry(createHistoryItem({ status: "partial_failure", is_session: false }))).toBe(false);
    expect(isHistorySessionEntry(createHistoryItem({ status: "rolled_back", is_session: false }))).toBe(false);
    expect(isHistorySessionEntry(createHistoryItem({ status: "rollback_partial_failure", is_session: false }))).toBe(false);
  });

  it("builds workspace routes for sessions and history routes for execution records", () => {
    expect(getHistoryEntryHref(createHistoryItem({ execution_id: "session-1", status: "planning", is_session: true }))).toBe(
      "/workspace?session_id=session-1",
    );
    expect(
      getHistoryEntryHref(createHistoryItem({ execution_id: "exec-1", status: "completed", is_session: false })),
    ).toBe("/history?entry_id=exec-1");
    expect(
      getHistoryEntryReadonlyHref(createHistoryItem({ execution_id: "exec-2", status: "rolled_back", is_session: false })),
    ).toBe("/history?entry_id=exec-2");
  });

  it("returns normalized summaries for execution states", () => {
    expect(getHistoryEntrySummary(createHistoryItem({ status: "partial_failure", is_session: false }))).toBe("部分失败");
    expect(getHistoryEntrySummary(createHistoryItem({ status: "rollback_partial_failure", is_session: false }))).toBe(
      "回退部分失败",
    );
  });

  it("uses created time as the history entry name", () => {
    expect(getHistoryEntryName(createHistoryItem({ created_at: "2026-04-21T08:30:00+08:00" }))).toBe("2026/04/21 08:30");
  });
});
