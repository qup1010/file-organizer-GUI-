import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CompletionView } from "./completion-view";

vi.mock("./directory-tree-diff", () => ({
  DirectoryTreeDiff: () => <div>DirectoryTreeDiff</div>,
}));

vi.mock("./markdown-prose", () => ({
  MarkdownProse: ({ content }: { content: string }) => <div>{content}</div>,
}));

vi.mock("@/components/ui/confirm-dialog", () => ({
  ConfirmDialog: () => null,
}));

describe("CompletionView", () => {
  afterEach(() => {
    cleanup();
  });

  it("shows item id and target slot metadata for review items", () => {
    render(
      <CompletionView
        journal={{
          journal_id: "j1",
          execution_id: "e1",
          target_dir: "D:/download",
          status: "completed",
          created_at: "2026-04-20T00:00:00Z",
          item_count: 1,
          success_count: 1,
          failure_count: 0,
          rollback_attempt_count: 0,
          items: [
            {
              action_type: "MOVE",
              status: "success",
              source: "D:/download/contract.pdf",
              target: "D:/download/Review/contract.pdf",
              display_name: "contract.pdf",
              item_id: "F001",
              target_slot_id: "Review",
            },
          ],
        }}
        summary="done"
        loading={false}
        targetDir="D:/download"
        isBusy={false}
        onOpenExplorer={() => {}}
        onCleanupDirs={() => {}}
        onRollback={() => {}}
        onGoHome={() => {}}
      />,
    );

    expect(screen.getAllByText("contract.pdf").length).toBeGreaterThan(0);
    expect(screen.getByText("F001 · Review")).toBeInTheDocument();
  });
});
