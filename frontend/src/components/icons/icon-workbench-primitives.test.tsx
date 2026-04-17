import React, { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { IconWorkbenchFooterBar } from "./icon-workbench-footer-bar";
import { IconWorkbenchPreviewModal } from "./icon-workbench-preview-modal";
import { IconWorkbenchTemplateDrawer } from "./icon-workbench-template-drawer";
import { IconWorkbenchVersionThumb } from "./icon-workbench-version-thumb";

vi.mock("motion/react", () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  motion: {
    div: ({ children, ...props }: React.ComponentProps<"div">) => <div {...props}>{children}</div>,
  },
}));

vi.mock("@/lib/runtime", () => ({
  isTauriDesktop: () => false,
  saveFileAsTauri: vi.fn(),
}));

describe("Icon workbench primitives", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("shows accurate applied wording in preview modal", () => {
    const { rerender } = render(
      <IconWorkbenchPreviewModal
        src="http://example.com/icon.png"
        folderName="Alpha"
        folderPath="D:/Alpha"
        onClose={() => {}}
        onApply={() => {}}
        isApplied={false}
        isCurrentVersion={true}
      />,
    );

    expect(screen.getByText("未应用")).toBeInTheDocument();
    expect(screen.getByText("这是当前版本，但当前版本不等于已应用。")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /应用到文件夹/i })).toBeInTheDocument();

    rerender(
      <IconWorkbenchPreviewModal
        src="http://example.com/icon.png"
        folderName="Alpha"
        folderPath="D:/Alpha"
        onClose={() => {}}
        onApply={() => {}}
        isApplied={true}
        isCurrentVersion={false}
        onOpenFolder={() => {}}
      />,
    );

    expect(screen.getByText("已应用")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /打开文件夹查看/i })).toBeInTheDocument();
  });

  it("shows real placeholder variables and allows inserting them in template drawer", async () => {
    const user = userEvent.setup();

    function Wrapper() {
      const [prompt, setPrompt] = useState("");
      return (
        <IconWorkbenchTemplateDrawer
          open
          onClose={() => {}}
          templates={[]}
          templatesLoading={false}
          selectedTemplate={{
            template_id: "builtin-1",
            name: "内置模板",
            description: "",
            prompt_template: "",
            is_builtin: true,
            created_at: "2026-01-01T00:00:00+00:00",
            updated_at: "2026-01-01T00:00:00+00:00",
          }}
          templateNameDraft="内置模板"
          templateDescriptionDraft=""
          templatePromptDraft={prompt}
          templateActionLoading={false}
          onSelectTemplate={() => {}}
          onTemplateNameChange={() => {}}
          onTemplateDescriptionChange={() => {}}
          onTemplatePromptChange={setPrompt}
          onReloadTemplates={() => {}}
          onCreateTemplate={() => {}}
          onUpdateTemplate={() => {}}
          onDeleteTemplate={() => {}}
        />
      );
    }

    render(<Wrapper />);

    expect(screen.getByText(/{{subject}}/i)).toBeInTheDocument();
    expect(screen.getByText(/{{folder_name}}/i)).toBeInTheDocument();
    expect(screen.getByText(/{{category}}/i)).toBeInTheDocument();
    expect(screen.getByText("系统模板可选用，但不能直接覆盖保存。请先复制为自定义模板后再修改。")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /插入 主题/i }));

    const textboxes = screen.getAllByRole("textbox");
    expect(textboxes.at(-1)).toHaveValue("{{subject}}");
  });

  it("shows batch background removal progress in footer", () => {
    render(
      <IconWorkbenchFooterBar
        targetCount={6}
        isGenerating={false}
        isApplying={false}
        onGenerate={() => {}}
        onApplyBatch={() => {}}
        canApplyBatch={true}
        onRemoveBgBatch={() => {}}
        canRemoveBgBatch={true}
        isRemovingBgBatch={true}
        removeBgBatchProgress={{
          total: 6,
          completed: 3,
          success: 3,
          failed: 0,
          activeFolderNames: ["网页存档", "灵感板"],
        }}
        selectedTemplateName={null}
        generateBlockedReason="先选择一个风格模板"
      />,
    );

    expect(screen.getByText("正在同时为 「网页存档」、「灵感板」 去除背景，已完成 3/6。")).toBeInTheDocument();
  });

  it("distinguishes current version from applied version in the version card", () => {
    const version = {
      version_id: "version-1",
      version_number: 2,
      prompt: "prompt",
      image_path: "D:/preview.png",
      image_url: "/api/icon.png",
      status: "ready" as const,
      created_at: "2026-01-01T00:00:00+00:00",
    };

    const { rerender } = render(
      <IconWorkbenchVersionThumb
        version={version}
        isSelected={true}
        isApplied={false}
        onSelect={() => {}}
        onZoom={() => {}}
        onApply={() => {}}
        onRemoveBg={() => {}}
        onDelete={() => {}}
        baseUrl="http://127.0.0.1:8765"
        apiToken=""
      />,
    );

    expect(screen.getByText("当前版本")).toBeInTheDocument();
    expect(screen.queryByText("当前有效")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "重新应用" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "应用到系统" })).toBeInTheDocument();

    rerender(
      <IconWorkbenchVersionThumb
        version={version}
        isSelected={true}
        isApplied={true}
        onSelect={() => {}}
        onZoom={() => {}}
        onApply={() => {}}
        onRemoveBg={() => {}}
        onDelete={() => {}}
        baseUrl="http://127.0.0.1:8765"
        apiToken=""
      />,
    );

    expect(screen.getByText("已应用")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "重新应用" })).toBeInTheDocument();
  });
});
