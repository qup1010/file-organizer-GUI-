import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

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
  it("shows previous-plan sync hint while a new plan is running", () => {
    render(
      <PreviewPanel
        plan={{
          summary: "旧方案摘要",
          items: [],
          groups: [],
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
        }}
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
});
