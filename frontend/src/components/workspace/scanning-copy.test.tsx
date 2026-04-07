import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { MinimalScanningView } from "./minimal-scanning-view";
import { ScanningOverlay } from "./scanning-overlay";

vi.mock("framer-motion", () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  motion: {
    div: ({ children, ...props }: React.ComponentProps<"div">) => <div {...props}>{children}</div>,
  },
}));

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

describe("scanning copy", () => {
  it("renders simpler scanning text in the minimal scanning view", () => {
    render(
      <MinimalScanningView
        scanner={{
          status: "running",
          processed_count: 2,
          total_count: 5,
          current_item: "report.pdf",
          recent_analysis_items: [],
          message: "正在读取 report.pdf",
          batch_count: 4,
        }}
        progressPercent={40}
      />,
    );

    expect(screen.getAllByText("正在扫描").length).toBeGreaterThan(0);
    expect(screen.getByText("正在读取文件，完成后会生成整理方案。")).toBeInTheDocument();
    expect(screen.getByText("当前进度")).toBeInTheDocument();
    expect(screen.getAllByText("最近处理").length).toBeGreaterThan(0);
    expect(screen.queryByText("扫描作业说明")).not.toBeInTheDocument();
    expect(screen.queryByText("自动分类引擎")).not.toBeInTheDocument();
  });

  it("renders simpler scanning text in the overlay", () => {
    render(
      <ScanningOverlay
        scanner={{
          status: "running",
          processed_count: 2,
          total_count: 5,
          current_item: "report.pdf",
          recent_analysis_items: [],
          message: "正在读取 report.pdf",
        }}
        progressPercent={40}
      />,
    );

    expect(screen.getAllByText("正在扫描").length).toBeGreaterThan(0);
    expect(screen.getByText("正在读取文件，请稍候。")).toBeInTheDocument();
    expect(screen.getByText("当前文件")).toBeInTheDocument();
    expect(screen.getAllByText("最近处理").length).toBeGreaterThan(0);
    expect(screen.queryByText("实时分析记录")).not.toBeInTheDocument();
  });
});
