"use client";

import React, { useEffect } from "react";
import { X, Check, Palette } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import type { IconTemplate } from "@/types/icon-workbench";

interface IconWorkbenchStylePanelProps {
  isOpen: boolean;
  onClose: () => void;
  templates: IconTemplate[];
  onSelect: (id: string) => void;
  onRequestManageTemplate?: (id: string) => void;
  selectedTemplateId: string;
}

/**
 * 全屏风格选择面板 - 精简版
 * 专注于展示风格卡片的沉浸式体验。
 */
export function IconWorkbenchStylePanel({
  isOpen,
  onClose,
  templates,
  onSelect,
  selectedTemplateId,
}: IconWorkbenchStylePanelProps) {
  // ESC 键自动关闭
  useEffect(() => {
    if (!isOpen) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[62] flex items-center justify-center p-6 lg:p-12">
      {/* 遮罩背景 */}
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-on-surface/40 backdrop-blur-md"
      />

      {/* 核心面板容器 */}
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
        className="relative flex h-full w-full max-w-[1160px] flex-col overflow-hidden rounded-[12px] border border-on-surface/10 bg-surface shadow-[0_32px_80px_-16px_rgba(0,0,0,0.15)]"
      >
        {/* 顶部标题栏 */}
        <div className="flex items-center justify-between border-b border-on-surface/6 px-8 py-5 bg-surface-container-lowest/50 backdrop-blur-sm z-10">
          <div className="flex items-center gap-4">
            <div className="flex h-11 w-11 items-center justify-center rounded-[10px] bg-primary/10 text-primary shadow-inner">
              <Palette className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-[19px] font-black tracking-tight text-on-surface leading-tight">选择风格模板</h2>
              <p className="text-[12px] font-bold text-ui-muted opacity-80 mt-0.5">选中后将作为当前图标生成的视觉基准</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="group flex h-10 w-10 items-center justify-center rounded-full hover:bg-error/10 text-ui-muted hover:text-error transition-all"
          >
            <X className="h-5.5 w-5.5 transition-transform group-hover:rotate-90" />
          </button>
        </div>

      {/* 风格展示区 */}
      <div className="flex-1 overflow-y-auto px-8 py-8 scrollbar-thin bg-surface-container-lowest/20">
        <div className="mx-auto grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {templates.map((template: IconTemplate) => {
            const isSelected = template.template_id === selectedTemplateId;
            return (
              <button
                key={template.template_id}
                onClick={() => {
                  onSelect(template.template_id);
                  onClose();
                }}
                className={cn(
                  "group relative flex flex-col rounded-[12px] border p-4 text-left transition-all duration-300 active:scale-[0.98]",
                  isSelected
                    ? "border-primary/30 bg-primary/5 shadow-xl ring-1 ring-primary/20"
                    : "border-on-surface/8 bg-surface-container-lowest hover:border-primary/20 hover:bg-surface-container-lowest hover:shadow-lg",
                )}
              >
                {/* 封面预览 */}
                <div className="relative mb-4 aspect-square w-full overflow-hidden rounded-[8px] border border-on-surface/6 bg-surface-container-low">
                  {template.cover_image ? (
                    <img
                      src={template.cover_image}
                      alt={template.name}
                      className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-primary/30">
                      <Palette className="h-12 w-12" />
                    </div>
                  )}
                  
                  {/* 选中角标 */}
                  {isSelected && (
                    <div className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-primary text-white shadow-lg ring-4 ring-white">
                      <Check className="h-4.5 w-4.5 stroke-[3]" />
                    </div>
                  )}
                </div>

                {/* 文本信息 */}
                <div className="flex-1 space-y-2">
                  <h3 className="text-[17px] font-black tracking-tight text-on-surface group-hover:text-primary transition-colors">
                    {template.name}
                  </h3>
                  <p className="line-clamp-2 text-[13px] leading-relaxed text-ui-muted italic">
                    {template.description || "用于生成这一类文件夹图标的默认风格。"}
                  </p>
                </div>

                {/* 底部标记 */}
                <div className="mt-5 flex w-full items-center justify-between border-t border-on-surface/4 pt-4">
                  <span className={cn(
                    "rounded-full px-2.5 py-0.5 text-[10px] font-bold tracking-wider",
                    template.is_builtin ? "bg-on-surface/6 text-ui-muted" : "bg-primary/10 text-primary"
                  )}>
                    {template.is_builtin ? "内置模板" : "自定义模板"}
                  </span>
                  <span className="text-[11px] font-black text-primary opacity-0 transition-all translate-x-1 group-hover:opacity-100 group-hover:translate-x-0">
                    使用这个模板
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>
      </motion.div>
    </div>
  );
}
