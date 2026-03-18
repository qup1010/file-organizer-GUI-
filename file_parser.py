import os

import docx
import pandas as pd
import pypdf

# --- 全局配置 ---
DEFAULT_MAX_LEN = 300
DEFAULT_LIST_DEPTH = 1


def _normalize_local_path(path: str) -> str:
    return os.path.normpath(path or ".")


def _is_allowed_local_path(path: str) -> bool:
    normalized = _normalize_local_path(path)
    if os.path.isabs(normalized):
        return False
    if normalized == ".":
        return True
    if normalized.startswith(".."):
        return False

    first_segment = normalized.split(os.sep, 1)[0]
    return first_segment in {"test", "test_temp_list_dir"} or os.sep not in normalized


def read_pdf(filepath, max_len=DEFAULT_MAX_LEN):
    """提取 PDF 文本内容。"""
    try:
        reader = pypdf.PdfReader(filepath)
        text = ""
        for page in reader.pages:
            text += page.extract_text() or ""
            if len(text) >= max_len:
                break
        return text.strip()
    except Exception as exc:
        return f"读取 PDF 失败: {exc}"


def read_docx(filepath, max_len=DEFAULT_MAX_LEN):
    """提取 Word 文本内容。"""
    try:
        document = docx.Document(filepath)
        text = ""
        for para in document.paragraphs:
            text += para.text + "\n"
            if len(text) >= max_len:
                break
        return text.strip()
    except Exception as exc:
        return f"读取 Word 失败: {exc}"


def read_excel(filepath, max_len=DEFAULT_MAX_LEN):
    """提取 Excel 内容摘要。"""
    try:
        workbook = pd.ExcelFile(filepath)
        output = []
        total_len = 0

        for sheet_name in workbook.sheet_names:
            dataframe = pd.read_excel(filepath, sheet_name=sheet_name, nrows=10)
            combined = f"Sheet: {sheet_name}\n{dataframe.to_string(index=False)}\n"
            output.append(combined)
            total_len += len(combined)
            if total_len >= max_len:
                break

        return "".join(output)
    except Exception as exc:
        return f"读取 Excel 失败: {exc}"


def list_local_files(directory=".", max_depth=DEFAULT_LIST_DEPTH):
    """列出指定目录下一层内的目录和文件摘要。"""
    try:
        directory = _normalize_local_path(directory)
        if not _is_allowed_local_path(directory):
            return "错误：基于安全考虑，仅允许查看当前目录或 test 子目录下的内容。"
        if not os.path.exists(directory):
            return f"错误：目录 {directory} 不存在。"
        if not os.path.isdir(directory):
            return f"错误：{directory} 不是目录。"

        lines = ["路径 | 类型 | 说明"]
        root_depth = directory.count(os.sep)

        top_level_entries = sorted(
            (entry for entry in os.scandir(directory) if not entry.name.startswith(".")),
            key=lambda entry: entry.name.lower(),
        )
        lines.append(f"{directory} | dir | 包含 {len(top_level_entries)} 个条目")

        for entry in top_level_entries:
            relative_path = os.path.join(directory, entry.name).replace("\\", "/")
            if entry.is_dir():
                child_entries = sorted(
                    (child for child in os.scandir(entry.path) if not child.name.startswith(".")),
                    key=lambda child: child.name.lower(),
                )
                lines.append(f"{relative_path} | dir | 包含 {len(child_entries)} 个条目")

                if max_depth >= 1:
                    current_depth = entry.path.count(os.sep) - root_depth
                    if current_depth <= max_depth:
                        for child in child_entries:
                            child_path = os.path.join(relative_path, child.name).replace("\\", "/")
                            if child.is_dir():
                                lines.append(f"{child_path} | dir | 已达到递归深度限制")
                            else:
                                suffix = os.path.splitext(child.name)[1].lower() or "无扩展名"
                                lines.append(f"{child_path} | file | {suffix}")
            else:
                suffix = os.path.splitext(entry.name)[1].lower() or "无扩展名"
                lines.append(f"{relative_path} | file | {suffix}")

        return "\n".join(lines)
    except Exception as exc:
        return f"无法列出目录 {directory}: {exc}"


def read_local_file(filename, max_len=DEFAULT_MAX_LEN):
    """读取本地文件内容。"""
    try:
        filename = _normalize_local_path(filename)
        if not _is_allowed_local_path(filename):
            return "错误：基于安全考虑，本程序仅限读取当前目录或 test 子目录下的文件。"
        if not os.path.exists(filename):
            return f"错误：文件 {filename} 不存在。"

        ext = os.path.splitext(filename)[1].lower()
        if ext == ".pdf":
            content = read_pdf(filename, max_len=max_len)
        elif ext in [".docx", ".doc"]:
            content = read_docx(filename, max_len=max_len)
        elif ext in [".xlsx", ".xls"]:
            content = read_excel(filename, max_len=max_len)
        else:
            with open(filename, "r", encoding="utf-8") as file:
                content = file.read()

        if len(content) > max_len:
            content = content[:max_len] + "\n...[内容过长已截断]"

        return f"--- 文件 [{filename}] 内容开始 ---\n{content}\n--- 内容结束 ---"
    except UnicodeDecodeError:
        return "该文件可能是二进制格式或使用了非 UTF-8 编码，请检查文件后缀是否正确。"
    except Exception as exc:
        return f"无法读取文件 {filename}: {exc}"
