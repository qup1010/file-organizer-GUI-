import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PreviewPanel } from "./preview-panel";

vi.mock("motion/react", () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  motion: {
    div: ({ children, ...props }: React.ComponentProps<"div">) => <div {...props}>{children}</div>,
  },
}));

vi.mock("./markdown-prose", () => ({
  MarkdownProse: ({ content }: { content: string }) => <div>{content}</div>,
}));

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogDescription: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogClose: ({ children }: { children: React.ReactNode }) => <button type="button">{children}</button>,
}));

describe("PreviewPanel", () => {
  afterEach(() => {
    cleanup();
  });

  const createPlan = () => ({
    summary: "",
    items: [],
    groups: [],
    target_slots: [],
    mappings: [],
    display_plan: null,
    unresolved_items: [],
    review_items: [],
    invalidated_items: [],
    change_highlights: [],
    stats: {
      directory_count: 0,
      move_count: 0,
      unresolved_count: 0,
    },
    readiness: {
      can_precheck: false,
    },
  });

  it("shows previous-plan sync hint while a new plan is running", () => {
    render(
      <PreviewPanel
        plan={{ ...createPlan(), summary: "旧方案摘要" }}
        stage="planning"
        isBusy={false}
        isPlanSyncing
        plannerStatus={{
          isRunning: true,
          preservingPreviousPlan: true,
        }}
        onRunPrecheck={() => {}}
        onUpdateItem={() => {}}
      />,
    );

    expect(screen.getByText("正在基于你的最新要求重算方案")).toBeInTheDocument();
    expect(screen.getByText("当前显示的是上一版方案，新方案完成后会自动替换")).toBeInTheDocument();
  });

  it("allows collapsing the pending queue to free space for the tree", () => {
    render(
      <PreviewPanel
        plan={{
          ...createPlan(),
          summary: "方案摘要",
          items: [
            {
              item_id: "item-review-1",
              display_name: "important_invoice_301.exe",
              source_relpath: "incoming/important_invoice_301.exe",
              target_slot_id: "Review",
              status: "review",
              mapping_status: "review",
              suggested_purpose: "Review",
              content_summary: "待人工核对",
              reason: "用途不够稳定",
              confidence: 0.62,
            },
          ],
          stats: {
            directory_count: 1,
            move_count: 1,
            unresolved_count: 0,
          },
          readiness: {
            can_precheck: true,
          },
        }}
        stage="ready_for_precheck"
        isBusy={false}
        onRunPrecheck={() => {}}
        onUpdateItem={() => {}}
      />,
    );

    expect(screen.getByText("点击条目后，右侧会显示更详细的检查信息。")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "查看" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "收起" }));

    expect(screen.queryByText("点击条目后，右侧会显示更详细的检查信息。")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "查看" })).not.toBeInTheDocument();
    expect(screen.getByText("待处理队列")).toBeInTheDocument();
    expect(screen.getAllByText("待核对 1").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: "展开" }));

    expect(screen.getByText("点击条目后，右侧会显示更详细的检查信息。")).toBeInTheDocument();
  });

  it("shows the before tree by default while planning is running", () => {
    render(
      <PreviewPanel
        plan={createPlan()}
        stage="planning"
        isBusy={false}
        plannerStatus={{
          isRunning: true,
          preservingPreviousPlan: false,
        }}
        plannerRunKey="run-1"
        sourceTreeEntries={[
          { source_relpath: "照片", display_name: "照片", entry_type: "directory" },
          { source_relpath: "照片/cat.png", display_name: "cat.png", entry_type: "file" },
        ]}
        onRunPrecheck={() => {}}
        onUpdateItem={() => {}}
      />,
    );

    expect(screen.getByText("照片")).toBeInTheDocument();
    expect(screen.getByText("cat.png")).toBeInTheDocument();
    expect(screen.queryByText("整理后结构尚在生成")).not.toBeInTheDocument();
  });

  it("shows after-tree empty state when the plan is still generating", () => {
    render(
      <PreviewPanel
        plan={createPlan()}
        stage="planning"
        isBusy={false}
        plannerStatus={{
          isRunning: true,
          preservingPreviousPlan: false,
        }}
        plannerRunKey="run-1"
        sourceTreeEntries={[
          { source_relpath: "照片", display_name: "照片", entry_type: "directory" },
          { source_relpath: "照片/cat.png", display_name: "cat.png", entry_type: "file" },
        ]}
        onRunPrecheck={() => {}}
        onUpdateItem={() => {}}
      />,
    );

    fireEvent.click(screen.getAllByRole("button", { name: "后" })[0]);

    expect(screen.getByText("整理后结构尚在生成")).toBeInTheDocument();
    expect(screen.getByText("先切回“前”查看原始目录，方案稳定后这里会自动出现整理后结构。")).toBeInTheDocument();
  });

  it("keeps the footer outside the scrollable middle region", () => {
    render(
      <PreviewPanel
        plan={createPlan()}
        stage="planning"
        isBusy={false}
        plannerStatus={{
          isRunning: true,
          preservingPreviousPlan: false,
        }}
        plannerRunKey="run-1"
        sourceTreeEntries={[
          { source_relpath: "照片", display_name: "照片", entry_type: "directory" },
          { source_relpath: "照片/cat.png", display_name: "cat.png", entry_type: "file" },
        ]}
        onRunPrecheck={() => {}}
        onUpdateItem={() => {}}
      />,
    );

    const scrollRegion = screen.getByTestId("preview-scroll-region");
    const footer = screen.getByTestId("preview-footer");

    expect(scrollRegion.contains(footer)).toBe(false);
    expect(screen.getByRole("button", { name: "等待方案同步完成" })).toBeInTheDocument();
  });

  it("shows incremental mapping rows before the structure reference", () => {
    render(
      <PreviewPanel
        plan={{
          ...createPlan(),
          items: [
            {
              item_id: "F001",
              display_name: "contract.pdf",
              source_relpath: "contract.pdf",
              target_slot_id: "D001",
              status: "planned",
              mapping_status: "assigned",
              suggested_purpose: "财务合同",
              content_summary: "付款协议",
              reason: "归入合同目录",
              confidence: 0.9,
            },
          ],
          target_slots: [
            {
              slot_id: "D001",
              display_name: "合同",
              relpath: "Finance/合同",
              depth: 1,
              is_new: false,
            },
          ],
          mappings: [
            {
              item_id: "F001",
              source_ref_id: "F001",
              target_slot_id: "D001",
              status: "assigned",
              reason: "归入合同目录",
              confidence: 0.9,
              user_overridden: false,
            },
          ],
          stats: {
            directory_count: 1,
            move_count: 1,
            unresolved_count: 0,
          },
          readiness: {
            can_precheck: true,
          },
        }}
        stage="ready_for_precheck"
        organizeMode="incremental"
        isBusy={false}
        incrementalSelection={{
          required: true,
          status: "ready",
          destination_index_depth: 2,
          root_directory_options: ["Finance", "Inbox"],
          target_directories: ["Finance"],
          target_directory_tree: [],
          pending_items_count: 1,
          source_scan_completed: true,
        }}
        onRunPrecheck={() => {}}
        onUpdateItem={() => {}}
      />,
    );

    expect(screen.getByText("归属映射")).toBeInTheDocument();
    expect(screen.getByText("contract.pdf -> Finance/合同")).toBeInTheDocument();
    expect(screen.getByText("结构参考")).toBeInTheDocument();
  });

  it("builds the after-tree from target slots without target_relpath", () => {
    render(
      <PreviewPanel
        plan={{
          ...createPlan(),
          items: [
            {
              item_id: "F001",
              display_name: "contract.pdf",
              source_relpath: "contract.pdf",
              target_slot_id: "D001",
              status: "planned",
              mapping_status: "assigned",
              suggested_purpose: "财务合同",
              content_summary: "付款协议",
              reason: "归入合同目录",
              confidence: 0.9,
            },
          ],
          target_slots: [
            {
              slot_id: "D001",
              display_name: "合同",
              relpath: "Finance/合同",
              depth: 1,
              is_new: false,
            },
          ],
          mappings: [
            {
              item_id: "F001",
              source_ref_id: "F001",
              target_slot_id: "D001",
              status: "assigned",
              reason: "归入合同目录",
              confidence: 0.9,
              user_overridden: false,
            },
          ],
          stats: {
            directory_count: 1,
            move_count: 1,
            unresolved_count: 0,
          },
          readiness: {
            can_precheck: true,
          },
        }}
        stage="ready_for_precheck"
        organizeMode="incremental"
        isBusy={false}
        incrementalSelection={{
          required: true,
          status: "ready",
          destination_index_depth: 2,
          root_directory_options: ["Finance", "Inbox"],
          target_directories: ["Finance"],
          target_directory_tree: [],
          pending_items_count: 1,
          source_scan_completed: true,
        }}
        onRunPrecheck={() => {}}
        onUpdateItem={() => {}}
      />,
    );

    fireEvent.click(screen.getAllByRole("button", { name: "后" })[0]);

    expect(screen.getByText("Finance")).toBeInTheDocument();
    expect(screen.getByText("合同")).toBeInTheDocument();
    expect(screen.getByText("contract.pdf")).toBeInTheDocument();
  });
});
