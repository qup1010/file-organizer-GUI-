import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ApiClient } from "@/lib/api";
import type { SettingsSnapshot } from "@/types/settings";

import SettingsPage from "./page";

const getSettings = vi.fn<() => Promise<SettingsSnapshot>>();
const createSettingsPreset = vi.fn();
const updateSettings = vi.fn();

vi.mock("framer-motion", () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  motion: {
    div: ({ children, ...props }: React.ComponentProps<"div">) => <div {...props}>{children}</div>,
    button: ({ children, whileTap: _whileTap, ...props }: React.ComponentProps<"button"> & { whileTap?: unknown }) => (
      <button {...props}>{children}</button>
    ),
  },
}));

vi.mock("@/lib/runtime", () => ({
  getApiBaseUrl: () => "http://127.0.0.1:8765",
  getApiToken: () => "",
  isTauriDesktop: () => false,
  invokeTauriCommand: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  createApiClient: () =>
    ({
      getSettings,
      createSettingsPreset,
      getSettingsRuntime: vi.fn(),
      updateSettings,
      activateSettingsPreset: vi.fn(),
      deleteSettingsPreset: vi.fn(),
      testSettings: vi.fn(),
    }) satisfies Partial<ApiClient>,
}));

function createSnapshot(): SettingsSnapshot {
  return {
    global_config: {
      IMAGE_ANALYSIS_ENABLED: true,
      LAUNCH_DEFAULT_TEMPLATE_ID: "general_downloads",
      LAUNCH_DEFAULT_LANGUAGE: "zh",
      LAUNCH_DEFAULT_DENSITY: "normal",
      LAUNCH_DEFAULT_PREFIX_STYLE: "none",
      DEBUG_MODE: false,
    },
    families: {
      text: {
        family: "text",
        configured: false,
        active_preset_id: "",
        active_preset: {
          id: "default",
          name: "默认文本模型",
          OPENAI_BASE_URL: "https://api.openai.com/v1",
          OPENAI_MODEL: "gpt-5.4",
          OPENAI_API_KEY: "",
          secret_state: "empty",
        },
        presets: [],
      },
      vision: {
        family: "vision",
        enabled: true,
        configured: false,
        active_preset_id: "",
        active_preset: {
          id: "default",
          name: "默认图片理解",
          IMAGE_ANALYSIS_NAME: "默认图片理解",
          IMAGE_ANALYSIS_BASE_URL: "https://host.example/v1",
          IMAGE_ANALYSIS_MODEL: "gpt-4o-mini",
          IMAGE_ANALYSIS_API_KEY: "",
          secret_state: "empty",
        },
        presets: [],
      },
      icon_image: {
        family: "icon_image",
        configured: false,
        active_preset_id: "",
        active_preset: {
          id: "default",
          name: "默认图标生图",
          image_model: {
            base_url: "https://host.example/v1",
            model: "gpt-image-1",
            secret_state: "empty",
          },
          image_size: "1024x1024",
          analysis_concurrency_limit: 1,
          image_concurrency_limit: 1,
          save_mode: "in_folder",
          text_model: {
            base_url: "https://api.openai.com/v1",
            model: "gpt-5.4",
            secret_state: "empty",
          },
        },
        presets: [],
      },
      bg_removal: {
        family: "bg_removal",
        configured: false,
        mode: "preset",
        preset_id: "builtin-1",
        active_preset: {
          name: "抠图默认",
          model_id: "space-id",
          api_type: "gradio_space",
          payload_template: "{}",
          hf_api_token: "",
          secret_state: "empty",
        },
        builtin_presets: [
          {
            id: "builtin-1",
            name: "默认抠图",
            model_id: "space-id",
            api_type: "gradio_space",
            payload_template: "{}",
          },
        ],
        custom: {
          name: "",
          model_id: "",
          api_type: "gradio_space",
          payload_template: "{}",
          hf_api_token: "",
          secret_state: "empty",
        },
      },
    },
    status: {
      text_configured: false,
      vision_configured: false,
      icon_image_configured: false,
      bg_removal_configured: false,
    },
  };
}

describe("SettingsPage preset flow", () => {
  beforeEach(() => {
    getSettings.mockReset();
    createSettingsPreset.mockReset();
    updateSettings.mockReset();
    getSettings.mockResolvedValue(createSnapshot());
    updateSettings.mockImplementation(async (payload) => ({
      ...createSnapshot(),
      global_config: {
        ...createSnapshot().global_config,
        ...(payload?.global_config || {}),
      },
    }));
  });

  it("shows an empty-state prompt instead of editing the default text preset", async () => {
    render(<SettingsPage />);

    expect(await screen.findByText("请先点击 + 创建一个预设")).toBeInTheDocument();
    expect(screen.queryByDisplayValue("gpt-5.4")).not.toBeInTheDocument();
  });


  it("shows a reminder banner when the text model is not configured", async () => {
    render(<SettingsPage />);

    expect(await screen.findByText("当前还没有可用的文本模型")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /去配置文本模型/i }).length).toBeGreaterThan(0);
  });

  it("opens the create preset dialog from the add button", async () => {
    const user = userEvent.setup();

    render(<SettingsPage />);

    const createButtons = await screen.findAllByRole("button", { name: /新建文本预设|新建预设/i });
    await user.click(createButtons[0]);

    expect(screen.getByText("新建文本预设")).toBeInTheDocument();
    expect(screen.getByDisplayValue("新的文本预设")).toBeInTheDocument();
  });

  it("does not render the duplicate preset name field in the text form", async () => {
    render(<SettingsPage />);

    await waitFor(() => {
      expect(screen.queryByDisplayValue("默认文本模型")).not.toBeInTheDocument();
    });
  });

  it("creates a text preset without sending duplicate internal preset name", async () => {
    const user = userEvent.setup();

    createSettingsPreset.mockResolvedValue(undefined);
    getSettings.mockResolvedValue(createSnapshot());

    render(<SettingsPage />);

    const createButtons = await screen.findAllByRole("button", { name: /新建文本预设|新建预设/i });
    await user.click(createButtons[0]);
    const presetNameInput = screen.getByRole("textbox");
    await user.clear(presetNameInput);
    await user.type(presetNameInput, "我的文本预设");
    await user.click(screen.getByRole("button", { name: /创建并切换|确认/i }));

    await waitFor(() => {
      expect(createSettingsPreset).toHaveBeenCalledWith(
        "text",
        expect.objectContaining({
          name: "我的文本预设",
          preset: {
            OPENAI_BASE_URL: "https://api.openai.com/v1",
            OPENAI_MODEL: "gpt-5.4",
          },
        }),
      );
    });
  });

  it("creates a vision preset without reusing the stale internal image name", async () => {
    const user = userEvent.setup();

    createSettingsPreset.mockResolvedValue(undefined);
    getSettings.mockResolvedValue(createSnapshot());

    render(<SettingsPage />);

    const visionLabel = (await screen.findAllByText("图片理解")).find((node) => node.closest("button")) ?? null;
    const visionTab = visionLabel?.closest("button") ?? null;
    expect(visionTab).not.toBeNull();
    await user.click(visionTab!);
    const createButtons = await screen.findAllByRole("button", { name: /新建图片理解预设|新建预设/i });
    await user.click(createButtons[0]);
    const presetNameInput = screen.getByRole("textbox");
    await user.clear(presetNameInput);
    await user.type(presetNameInput, "我的图片预设");
    await user.click(screen.getByRole("button", { name: /创建并切换|确认/i }));

    await waitFor(() => {
      expect(createSettingsPreset).toHaveBeenCalled();
    });

    const [family, payload] = createSettingsPreset.mock.calls[0];
    expect(family).toBe("vision");
    expect(payload.name).toBe("我的图片预设");
    expect(payload.preset).toEqual({
      IMAGE_ANALYSIS_BASE_URL: "https://host.example/v1",
      IMAGE_ANALYSIS_MODEL: "gpt-4o-mini",
    });
    expect(payload.preset).not.toHaveProperty("IMAGE_ANALYSIS_NAME");
  });

  it("shows launch placement default controls in the launch settings tab", async () => {
    render(<SettingsPage />);

    const launchTab = await screen.findByRole("button", { name: "启动默认值" });
    await userEvent.click(launchTab);

    expect(await screen.findByText("默认放置规则")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("例如：D:/archive/sorted")).toBeInTheDocument();
    expect(screen.getByText("Review 默认跟随新目录位置")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("新目录生成位置/Review")).toBeDisabled();
  });
});
