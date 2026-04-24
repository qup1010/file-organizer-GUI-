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
const isTauriDesktopMock = vi.fn();
const inspectPathsWithTauriMock = vi.fn();
const pickDirectoryWithTauriMock = vi.fn();
const pickDirectoriesWithTauriMock = vi.fn();
const pickFilesWithTauriMock = vi.fn();
const listDirectoryEntriesWithTauriMock = vi.fn();

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
  isTauriDesktop: () => isTauriDesktopMock(),
  inspectPathsWithTauri: (...args: unknown[]) => inspectPathsWithTauriMock(...args),
  pickDirectoryWithTauri: (...args: unknown[]) => pickDirectoryWithTauriMock(...args),
  pickDirectoriesWithTauri: (...args: unknown[]) => pickDirectoriesWithTauriMock(...args),
  pickFilesWithTauri: (...args: unknown[]) => pickFilesWithTauriMock(...args),
  listDirectoryEntriesWithTauri: (...args: unknown[]) => listDirectoryEntriesWithTauriMock(...args),
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

function openManualSourceInput() {
  if (screen.queryByPlaceholderText("输入完整绝对路径...")) {
    return;
  }
  fireEvent.click(screen.getByRole("button", { name: /手动输入路径|手填路径|收起手动输入/ }));
}

function openManualTargetInput() {
  fireEvent.click(screen.getByRole("button", { name: /手填路径/ }));
}

function addSource(path: string, sourceType: "directory" | "file" = "directory") {
  openManualSourceInput();
  const selectorButtons = screen.getAllByRole("button", {
    name: sourceType === "file" ? "文件" : "文件夹",
  });
  fireEvent.click(selectorButtons[selectorButtons.length - 1]);
  fireEvent.change(screen.getByPlaceholderText("输入完整绝对路径..."), {
    target: { value: path },
  });
  fireEvent.click(screen.getByRole("button", { name: "添加" }));
}

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
    isTauriDesktopMock.mockReset();
    inspectPathsWithTauriMock.mockReset();
    pickDirectoryWithTauriMock.mockReset();
    pickDirectoriesWithTauriMock.mockReset();
    pickFilesWithTauriMock.mockReset();
    listDirectoryEntriesWithTauriMock.mockReset();
    isTauriDesktopMock.mockReturnValue(false);

    getSettingsMock.mockResolvedValue({
      global_config: {
        LAUNCH_REVIEW_FOLLOWS_NEW_ROOT: true,
      },
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

    await screen.findByText("本次整理对象");
    addSource("D:/incoming");
    addSource("D:/incoming/readme.txt", "file");

    expect(screen.getByText("D:/incoming")).toBeInTheDocument();
    expect(screen.getByText("D:/incoming/readme.txt")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "下一步：选择整理方式" }));
    fireEvent.click(screen.getByRole("button", { name: "下一步：填写必要信息" }));
    fireEvent.click(screen.getByRole("button", { name: "修改放置规则" }));
    fireEvent.change(screen.getAllByRole("textbox")[0], {
      target: { value: "D:/sorted" },
    });
    fireEvent.click(screen.getByRole("button", { name: "读取目录并生成建议" }));

    await waitFor(() => {
      expect(createSessionAndStartScanMock).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          sources: [
            { source_type: "directory", path: "D:/incoming", directory_mode: "atomic" },
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

  it("falls back to the source workspace when full categorize output_dir is not manually overridden", async () => {
    render(<SessionLauncher />);

    await screen.findByText("本次整理对象");
    addSource("D:/incoming");
    fireEvent.click(screen.getByRole("button", { name: "下一步：选择整理方式" }));
    fireEvent.click(screen.getByRole("button", { name: "下一步：填写必要信息" }));
    fireEvent.click(screen.getByRole("button", { name: "读取目录并生成建议" }));

    await waitFor(() => {
        expect(createSessionAndStartScanMock).toHaveBeenCalledWith(
          expect.anything(),
          expect.objectContaining({
            output_dir: "D:",
          }),
        );
      });
  });

  it("starts directly from step one when launch skip prompt is enabled", async () => {
    getSettingsMock.mockResolvedValueOnce({
      global_config: {
        LAUNCH_SKIP_STRATEGY_PROMPT: true,
        LAUNCH_REVIEW_FOLLOWS_NEW_ROOT: true,
      },
      status: {
        text_configured: true,
      },
    });

    render(<SessionLauncher />);

    await screen.findByText("本次整理对象");
    addSource("D:/incoming");

    fireEvent.click(screen.getByRole("button", { name: "按默认配置开始整理" }));

    await waitFor(() => {
      expect(createSessionAndStartScanMock).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          sources: [{ source_type: "directory", path: "D:/incoming", directory_mode: "atomic" }],
          organize_method: "categorize_into_new_structure",
          output_dir: "D:",
        }),
      );
    });
  });

  it("fills target directories from a profile and submits assign-existing payload", async () => {
    render(<SessionLauncher />);

    await screen.findByText("本次整理对象");
    addSource("D:/downloads");
    fireEvent.click(screen.getByRole("button", { name: "下一步：选择整理方式" }));
    fireEvent.click(screen.getByRole("button", { name: /归入现有目录/ }));
    fireEvent.click(screen.getByRole("button", { name: "下一步：填写必要信息" }));

    const profileSelect = screen.getByRole("combobox");
    fireEvent.change(profileSelect, { target: { value: "profile-1" } });

    expect(await screen.findByText("D:/archive/docs")).toBeInTheDocument();
    expect(screen.getByText("D:/archive/media")).toBeInTheDocument();

    openManualTargetInput();
    fireEvent.change(screen.getByPlaceholderText("手动输入目标目录完整绝对路径"), {
      target: { value: "D:/archive/misc" },
    });
    fireEvent.click(screen.getByRole("button", { name: "添加" }));
    fireEvent.click(screen.getByRole("button", { name: "读取目录并确认目标" }));

    await waitFor(() => {
      expect(createSessionAndStartScanMock).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          sources: [{ source_type: "directory", path: "D:/downloads", directory_mode: "atomic" }],
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

  it("submits atomic directory sources as single items and falls back to the parent workspace root", async () => {
    render(<SessionLauncher />);

    await screen.findByText("本次整理对象");
    addSource("D:/incoming/project-bundle");
    fireEvent.click(screen.getByRole("button", { name: "下一步：选择整理方式" }));
    fireEvent.click(screen.getByRole("button", { name: "下一步：填写必要信息" }));
    fireEvent.click(screen.getByRole("button", { name: "读取目录并生成建议" }));

    await waitFor(() => {
      expect(createSessionAndStartScanMock).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          sources: [{ source_type: "directory", path: "D:/incoming/project-bundle", directory_mode: "atomic" }],
          organize_method: "categorize_into_new_structure",
          output_dir: "D:/incoming",
        }),
      );
    });
  });

  it("blocks assign-existing submission when no target profile or target directories are provided", async () => {
    render(<SessionLauncher />);

    await screen.findByText("本次整理对象");
    addSource("D:/downloads");
    fireEvent.click(screen.getByRole("button", { name: "下一步：选择整理方式" }));
    fireEvent.click(screen.getByRole("button", { name: /归入现有目录/ }));
    fireEvent.click(screen.getByRole("button", { name: "下一步：填写必要信息" }));
    fireEvent.click(screen.getByRole("button", { name: "读取目录并确认目标" }));

    expect(await screen.findByText("归入现有目录时，至少需要选择一个目录配置或手动添加目标目录。")).toBeInTheDocument();
    expect(createSessionAndStartScanMock).not.toHaveBeenCalled();
  });

  it("shows the missing-target warning immediately after entering step three for assign-existing mode", async () => {
    render(<SessionLauncher />);

    await screen.findByText("本次整理对象");
    addSource("D:/downloads");
    fireEvent.click(screen.getByRole("button", { name: "下一步：选择整理方式" }));
    fireEvent.click(screen.getByRole("button", { name: /归入现有目录/ }));
    fireEvent.click(screen.getByRole("button", { name: "下一步：填写必要信息" }));

    expect(await screen.findByText("归入现有目录时，至少需要选择一个目录配置或手动添加目标目录。")).toBeInTheDocument();
    expect(createSessionAndStartScanMock).not.toHaveBeenCalled();
  });

  it("can save the current target directory set as a reusable profile from the secondary section", async () => {
    render(<SessionLauncher />);

    await screen.findByText("本次整理对象");
    addSource("D:/downloads");
    fireEvent.click(screen.getByRole("button", { name: "下一步：选择整理方式" }));
    fireEvent.click(screen.getByRole("button", { name: /归入现有目录/ }));
    fireEvent.click(screen.getByRole("button", { name: "下一步：填写必要信息" }));

    openManualTargetInput();
    fireEvent.change(screen.getByPlaceholderText("手动输入目标目录完整绝对路径"), {
      target: { value: "D:/archive/docs" },
    });
    fireEvent.click(screen.getByRole("button", { name: "添加" }));
    fireEvent.change(screen.getByPlaceholderText("配置名称（例：工作资料库）"), {
      target: { value: "新的配置" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存配置" }));

    await waitFor(() => {
      expect(createTargetProfileMock).toHaveBeenCalledWith({
        name: "新的配置",
        directories: [{ path: "D:/archive/docs", label: undefined }],
      });
    });
  });

  it("opens advanced settings in a dialog instead of expanding inline", async () => {
    render(<SessionLauncher />);

    await screen.findByText("本次整理对象");
    addSource("D:/incoming");
    fireEvent.click(screen.getByRole("button", { name: "下一步：选择整理方式" }));
    fireEvent.click(screen.getByRole("button", { name: "下一步：填写必要信息" }));

    fireEvent.click(screen.getByRole("button", { name: "打开高级设置" }));

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.getAllByText("高级设置").length).toBeGreaterThan(0);
    expect(screen.getByText("默认模板")).toBeInTheDocument();
  });

  it("uses global placement defaults and lets review follow the new-directory root", async () => {
    getSettingsMock.mockResolvedValueOnce({
      global_config: {
        LAUNCH_DEFAULT_NEW_DIRECTORY_ROOT: "D:/sorted-default",
        LAUNCH_REVIEW_FOLLOWS_NEW_ROOT: true,
      },
      status: {
        text_configured: true,
      },
    });

    render(<SessionLauncher />);

    await screen.findByText("本次整理对象");
    addSource("D:/incoming");
    fireEvent.click(screen.getByRole("button", { name: "下一步：选择整理方式" }));
    fireEvent.click(screen.getByRole("button", { name: "下一步：填写必要信息" }));

    expect(await screen.findByText("D:/sorted-default")).toBeInTheDocument();
    expect(screen.getByText("D:/sorted-default/Review")).toBeInTheDocument();
  });

  it("does not advance to step two when there are no sources", async () => {
    render(<SessionLauncher />);

    await screen.findByText("本次整理对象");
    expect(screen.getByRole("button", { name: "下一步：选择整理方式" })).toBeDisabled();
  });

  it("imports top-level items from a folder into a grouped preview and submits only real source items", async () => {
    isTauriDesktopMock.mockReturnValue(true);
    pickDirectoryWithTauriMock.mockResolvedValue("D:/Downloads");
    listDirectoryEntriesWithTauriMock.mockResolvedValue([
      { path: "D:/Downloads/ProjectA", is_dir: true, is_file: false },
      { path: "D:/Downloads/ProjectB", is_dir: true, is_file: false },
      { path: "D:/Downloads/notes.txt", is_dir: false, is_file: true },
      { path: "D:/Downloads/cover.png", is_dir: false, is_file: true },
      { path: "D:/Downloads/invoice.pdf", is_dir: false, is_file: true },
      { path: "D:/Downloads/archive.zip", is_dir: false, is_file: true },
    ]);

    render(<SessionLauncher />);

    await screen.findByText("本次整理对象");
    fireEvent.click(screen.getByRole("button", { name: "导入文件夹下所有项" }));

    expect(await screen.findByText("已从 D:/Downloads 导入 6 项")).toBeInTheDocument();
    expect(screen.queryByText("D:/Downloads/archive.zip")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "展开其余 1 项" }));
    expect(screen.getByText("D:/Downloads/archive.zip")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "下一步：选择整理方式" }));
    fireEvent.click(screen.getByRole("button", { name: "下一步：填写必要信息" }));
    fireEvent.click(screen.getByRole("button", { name: "读取目录并生成建议" }));

    await waitFor(() => {
      expect(createSessionAndStartScanMock).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          sources: [
            { source_type: "directory", path: "D:/Downloads/ProjectA", directory_mode: "atomic" },
            { source_type: "directory", path: "D:/Downloads/ProjectB", directory_mode: "atomic" },
            { source_type: "file", path: "D:/Downloads/notes.txt" },
            { source_type: "file", path: "D:/Downloads/cover.png" },
            { source_type: "file", path: "D:/Downloads/invoice.pdf" },
            { source_type: "file", path: "D:/Downloads/archive.zip" },
          ],
        }),
      );
    });
  });

  it("replaces an atomic folder item with imported top-level items when switching modes", async () => {
    isTauriDesktopMock.mockReturnValue(true);
    listDirectoryEntriesWithTauriMock.mockResolvedValue([
      { path: "D:/incoming/project-bundle/README.md", is_dir: false, is_file: true },
      { path: "D:/incoming/project-bundle/src", is_dir: true, is_file: false },
    ]);

    render(<SessionLauncher />);

    await screen.findByText("本次整理对象");
    addSource("D:/incoming/project-bundle");
    fireEvent.click(screen.getByRole("button", { name: "改为导入里面的项" }));

    expect(await screen.findByText("已从 D:/incoming/project-bundle 导入 2 项")).toBeInTheDocument();
    expect(screen.getByText("D:/incoming/project-bundle/README.md")).toBeInTheDocument();
    expect(screen.getByText("D:/incoming/project-bundle/src")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "下一步：选择整理方式" }));
    fireEvent.click(screen.getByRole("button", { name: "下一步：填写必要信息" }));
    fireEvent.click(screen.getByRole("button", { name: "读取目录并生成建议" }));

    await waitFor(() => {
      expect(createSessionAndStartScanMock).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          sources: [
            { source_type: "file", path: "D:/incoming/project-bundle/README.md" },
            { source_type: "directory", path: "D:/incoming/project-bundle/src", directory_mode: "atomic" },
          ],
        }),
      );
    });
  });
});
