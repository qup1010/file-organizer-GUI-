import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SessionLauncher } from "./session-launcher";

const pushMock = vi.fn();
const createSessionAndStartScanMock = vi.fn();
const startFreshSessionMock = vi.fn();
const getSettingsMock = vi.fn();
const getHistoryMock = vi.fn();
const getCommonDirsMock = vi.fn();
const getTargetProfilesMock = vi.fn();
const createTargetProfileMock = vi.fn();
const selectDirMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: pushMock,
  }),
}));

vi.mock("framer-motion", () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  motion: {
    div: ({ children, ...props }: React.ComponentProps<"div">) => <div {...props}>{children}</div>,
    button: ({
      children,
      whileTap: _whileTap,
      ...props
    }: React.ComponentProps<"button"> & { whileTap?: unknown }) => <button {...props}>{children}</button>,
  },
}));

vi.mock("./launcher/launch-transition-overlay", () => ({
  LaunchTransitionOverlay: () => null,
}));

vi.mock("./launcher/resume-prompt-dialog", () => ({
  ResumePromptDialog: () => null,
}));

vi.mock("@/lib/runtime", () => ({
  getApiBaseUrl: () => "http://127.0.0.1:8765",
  getApiToken: () => "",
  isTauriDesktop: () => false,
  pickDirectoryWithTauri: vi.fn(),
  pickDirectoriesWithTauri: vi.fn(),
  pickFilesWithTauri: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  createApiClient: () => ({
    getSettings: getSettingsMock,
    getHistory: getHistoryMock,
    getCommonDirs: getCommonDirsMock,
    getTargetProfiles: getTargetProfilesMock,
    createTargetProfile: createTargetProfileMock,
    selectDir: selectDirMock,
  }),
}));

vi.mock("@/lib/session-launcher-actions", () => ({
  createSessionAndStartScan: (...args: unknown[]) => createSessionAndStartScanMock(...args),
  startFreshSession: (...args: unknown[]) => startFreshSessionMock(...args),
  firstSourcePath: (sources: Array<{ path: string }>) => sources[0]?.path || "",
}));

describe("SessionLauncher", () => {
  beforeEach(() => {
    pushMock.mockReset();
    createSessionAndStartScanMock.mockReset();
    startFreshSessionMock.mockReset();
    getSettingsMock.mockReset();
    getHistoryMock.mockReset();
    getCommonDirsMock.mockReset();
    getTargetProfilesMock.mockReset();
    createTargetProfileMock.mockReset();
    selectDirMock.mockReset();

    getSettingsMock.mockResolvedValue({
      global_config: {},
      status: {
        text_configured: true,
      },
    });
    getHistoryMock.mockResolvedValue([]);
    getCommonDirsMock.mockResolvedValue([]);
    getTargetProfilesMock.mockResolvedValue([
      {
        profile_id: "profile-1",
        name: "工作资料库",
        directories: [
          { path: "D:/archive/docs", label: "文档" },
          { path: "D:/archive/media", label: "素材" },
        ],
        created_at: "2026-04-20T10:00:00Z",
        updated_at: "2026-04-20T10:00:00Z",
      },
    ]);
    createTargetProfileMock.mockResolvedValue({
      profile_id: "profile-2",
      name: "新的配置",
      directories: [{ path: "D:/archive/docs", label: "文档" }],
      created_at: "2026-04-20T10:00:00Z",
      updated_at: "2026-04-20T10:00:00Z",
    });
    createSessionAndStartScanMock.mockResolvedValue({
      mode: "created",
      session_id: "session-1",
      restorable_session: null,
      session_snapshot: null,
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("supports multiple file and directory sources and submits a full-categorize payload", async () => {
    render(<SessionLauncher />);

    await screen.findByText("待整理文件集");

    fireEvent.change(screen.getByPlaceholderText("手动输入目录路径"), {
      target: { value: "D:/incoming" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^添加$/ }));

    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "file" },
    });
    fireEvent.change(screen.getByPlaceholderText("手动输入文件路径"), {
      target: { value: "D:/incoming/readme.txt" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^添加$/ }));

    expect(screen.getAllByText("目录来源").length).toBeGreaterThan(0);
    expect(screen.getAllByText("文件来源").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: "下一步：定义目标" }));

    expect(screen.getAllByText("输出目录").length).toBeGreaterThan(0);
    fireEvent.change(screen.getByPlaceholderText("整体分类生成的新目录会写入这里"), {
      target: { value: "D:/sorted" },
    });
    fireEvent.click(screen.getByRole("button", { name: "开始扫描与分析" }));

    await waitFor(() => {
      expect(createSessionAndStartScanMock).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          sources: [
            { source_type: "directory", path: "D:/incoming" },
            { source_type: "file", path: "D:/incoming/readme.txt" },
          ],
          organize_method: "categorize_into_new_structure",
          output_dir: "D:/sorted",
          strategy: expect.objectContaining({
            organize_mode: "initial",
            task_type: "organize_full_directory",
            organize_method: "categorize_into_new_structure",
            output_dir: "D:/sorted",
          }),
        }),
      );
    });
  });

  it("blocks full categorize submission when output_dir is missing", async () => {
    render(<SessionLauncher />);

    await screen.findByText("待整理文件集");

    fireEvent.change(screen.getByPlaceholderText("手动输入目录路径"), {
      target: { value: "D:/incoming" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^添加$/ }));
    fireEvent.click(screen.getByRole("button", { name: "下一步：定义目标" }));
    fireEvent.click(screen.getByRole("button", { name: "开始扫描与分析" }));

    expect(await screen.findByText("整体分类必须先指定输出目录。")).toBeInTheDocument();
    expect(createSessionAndStartScanMock).not.toHaveBeenCalled();
  });

  it("fills target directories from a profile and submits assign-existing payload", async () => {
    render(<SessionLauncher />);

    await screen.findByText("待整理文件集");

    fireEvent.click(screen.getByRole("button", { name: /归入现有分类/ }));
    fireEvent.change(screen.getByPlaceholderText("手动输入目录路径"), {
      target: { value: "D:/downloads" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^添加$/ }));
    fireEvent.click(screen.getByRole("button", { name: "下一步：定义目标" }));

    const profileSelect = screen.getByRole("combobox");
    fireEvent.change(profileSelect, { target: { value: "profile-1" } });

    expect(await screen.findByText("D:/archive/docs")).toBeInTheDocument();
    expect(screen.getByText("D:/archive/media")).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("手动输入目标目录路径"), {
      target: { value: "D:/archive/misc" },
    });
    fireEvent.click(screen.getByRole("button", { name: "添加目录" }));
    fireEvent.click(screen.getByRole("button", { name: "开始扫描并进入目标确认" }));

    await waitFor(() => {
      expect(createSessionAndStartScanMock).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          sources: [{ source_type: "directory", path: "D:/downloads" }],
          organize_method: "assign_into_existing_categories",
          target_profile_id: "profile-1",
          target_directories: ["D:/archive/docs", "D:/archive/media", "D:/archive/misc"],
          strategy: expect.objectContaining({
            organize_mode: "incremental",
            task_type: "organize_into_existing",
            organize_method: "assign_into_existing_categories",
            target_profile_id: "profile-1",
          }),
        }),
      );
    });
  });

  it("blocks assign-existing submission when no target profile or target directories are provided", async () => {
    render(<SessionLauncher />);

    await screen.findByText("待整理文件集");

    fireEvent.click(screen.getByRole("button", { name: /归入现有分类/ }));
    fireEvent.change(screen.getByPlaceholderText("手动输入目录路径"), {
      target: { value: "D:/downloads" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^添加$/ }));
    fireEvent.click(screen.getByRole("button", { name: "下一步：定义目标" }));
    fireEvent.click(screen.getByRole("button", { name: "开始扫描并进入目标确认" }));

    expect(await screen.findByText("归入已有分类时，至少需要选择一个目录配置或手动添加目标目录。")).toBeInTheDocument();
    expect(createSessionAndStartScanMock).not.toHaveBeenCalled();
  });

  it("can save the current target directory set as a new profile", async () => {
    render(<SessionLauncher />);

    await screen.findByText("待整理文件集");

    fireEvent.click(screen.getByRole("button", { name: /归入现有分类/ }));
    fireEvent.change(screen.getByPlaceholderText("手动输入目录路径"), {
      target: { value: "D:/downloads" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^添加$/ }));
    fireEvent.click(screen.getByRole("button", { name: "下一步：定义目标" }));

    fireEvent.change(screen.getByPlaceholderText("手动输入目标目录路径"), {
      target: { value: "D:/archive/docs" },
    });
    fireEvent.click(screen.getByRole("button", { name: "添加目录" }));
    fireEvent.change(screen.getByPlaceholderText("例如：工作资料库 / 个人归档库"), {
      target: { value: "新的配置" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存当前目录集合" }));

    await waitFor(() => {
      expect(createTargetProfileMock).toHaveBeenCalledWith({
        name: "新的配置",
        directories: [{ path: "D:/archive/docs", label: undefined }],
      });
    });
  });
});
