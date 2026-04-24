import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PrecheckView } from "./precheck-view";

vi.mock("./directory-tree-diff", () => ({
  DirectoryTreeDiff: () => <div>DirectoryTreeDiff</div>,
}));

describe("PrecheckView", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders item metadata from plan items and target slots", () => {
    render(
      <PrecheckView
        summary={{
          can_execute: true,
          blocking_errors: [],
          warnings: [],
          mkdir_preview: [],
          move_preview: [
            {
              item_id: "F001",
              source: "D:/download/contract.pdf",
              target: "D:/download/Docs/contract.pdf",
            },
          ],
          issues: [],
        }}
        planItems={[
          {
            item_id: "F001",
            display_name: "contract.pdf",
            source_relpath: "contract.pdf",
            target_slot_id: "D001",
            status: "planned",
            mapping_status: "planned",
          },
        ]}
        targetSlots={[
          {
            slot_id: "D001",
            display_name: "合同",
            relpath: "Docs",
            depth: 1,
            is_new: false,
          },
        ]}
        isBusy={false}
        onRequestExecute={() => {}}
        onBack={() => {}}
      />,
    );

    expect(screen.getAllByText("contract.pdf").length).toBeGreaterThan(0);
    expect(screen.getByText(/F001/)).toBeInTheDocument();
    expect(screen.getByText("合同")).toBeInTheDocument();
  });
});
