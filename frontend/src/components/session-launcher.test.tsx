import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SessionLauncher } from "./session-launcher";

const pushMock = vi.fn();
const createSessionAndStartScanMock = vi.fn();
const startFreshSessionMock = vi.fn();
const getSettingsMock = vi.fn();
const getHistoryMock = vi.fn();
const getCommonDirsMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: pushMock,
  }),
}));

vi.mock("framer-motion", () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  motion: {
    div: ({ children, ...props }: React.ComponentProps<"div">) => <div {...props}>{children}</div>,
    button: ({ children, whileTap: _whileTap, ...props }: React.ComponentProps<"button"> & { whileTap?: unknown }) => (
      <button {...props}>{children}</button>
    ),
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
}));

vi.mock("@/lib/api", () => ({
  createApiClient: () => ({
    getSettings: getSettingsMock,
    getHistory: getHistoryMock,
    getCommonDirs: getCommonDirsMock,
    selectDir: vi.fn(),
  }),
}));

vi.mock("@/lib/session-launcher-actions", () => ({
  createSessionAndStartScan: (...args: unknown[]) => createSessionAndStartScanMock(...args),
  startFreshSession: (...args: unknown[]) => startFreshSessionMock(...args),
}));

describe("SessionLauncher", () => {
  beforeEach(() => {
    pushMock.mockReset();
    createSessionAndStartScanMock.mockReset();
    startFreshSessionMock.mockReset();
    getSettingsMock.mockReset();
    getHistoryMock.mockReset();
    getCommonDirsMock.mockReset();

    getSettingsMock.mockResolvedValue({
      global_config: {},
      status: {
        text_configured: true,
      },
    });
    getHistoryMock.mockResolvedValue([]);
    getCommonDirsMock.mockResolvedValue([]);
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

  it("switches to organize-into-existing UI and submits the updated task_type", async () => {
    render(<SessionLauncher />);

    await screen.findByRole("button", { name: /整理整个目录/ });
    expect(screen.getByRole("button", { name: "开始扫描与分析" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /归入已有目录/ }));

    expect(screen.getByRole("button", { name: "下一步：选择目标目录" })).toBeInTheDocument();
    expect(screen.getByText("目标目录深度")).toBeInTheDocument();
    expect(screen.getByText("归档倾向")).toBeInTheDocument();
    expect(screen.queryByText("整理模板")).not.toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("请选择文件夹，或在此手动输入路径"), {
      target: { value: "D:/Downloads" },
    });
    fireEvent.click(screen.getByRole("button", { name: "下一步：选择目标目录" }));

    await waitFor(() => {
      expect(createSessionAndStartScanMock).toHaveBeenCalledWith(
        expect.anything(),
        "D:/Downloads",
        true,
        expect.objectContaining({
          organize_mode: "incremental",
          task_type: "organize_into_existing",
        }),
      );
    });
  });
});
