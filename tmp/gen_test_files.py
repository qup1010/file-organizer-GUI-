import os
import random
from pathlib import Path

def generate_test_files(target_dir: str, count: int = 500):
    base_path = Path(target_dir)
    base_path.mkdir(parents=True, exist_ok=True)
    
    # 模拟真实世界的文件类别
    extensions = {
        "docs": [".pdf", ".docx", ".xlsx", ".pptx", ".txt", ".md"],
        "media": [".jpg", ".png", ".gif", ".mp4", ".mov", ".mp3"],
        "code": [".py", ".js", ".html", ".css", ".json", ".yaml"],
        "archives": [".zip", ".tar.gz", ".rar", ".7z"],
        "misc": [".tmp", ".bak", ".iso", ".exe"]
    }
    
    adjectives = ["important", "confidential", "old", "new", "draft", "final", "backup", "v2", "legacy", "test"]
    nouns = ["project", "invoice", "report", "photo", "document", "script", "config", "data", "log", "summary"]
    
    # 也可以创建一些深层文件夹结构
    subfolders = ["work", "personal", "finance", "temp", "archive/2024", "archive/2023", "downloads/incoming"]
    for sub in subfolders:
        (base_path / sub).mkdir(parents=True, exist_ok=True)

    print(f"Starting generation of {count} files in {target_dir}...")
    
    for i in range(count):
        # 随机选择文件名组合
        adj = random.choice(adjectives)
        noun = random.choice(nouns)
        ext_group = random.choice(list(extensions.keys()))
        ext = random.choice(extensions[ext_group])
        
        # 随机决定是否放在子目录中
        if random.random() > 0.7:
             folder = random.choice(subfolders)
             file_path = base_path / folder / f"{adj}_{noun}_{i}{ext}"
        else:
             file_path = base_path / f"{adj}_{noun}_{i}{ext}"
        
        # 创建文件并写入少量内容（模拟文件内容分析）
        with open(file_path, "w", encoding="utf-8") as f:
            f.write(f"This is a dummy test file for FilePilot stability testing.\n")
            f.write(f"Tag: {adj}\n")
            f.write(f"Type: {ext_group}\n")
            f.write(f"ID: {i}\n")
            # 为某些文件增加内容长度以测试读取稳定性
            if random.random() > 0.9:
                f.write("A long content for testing: " + "Lorem ipsum " * 100)

    print("Success: Generated 500+ test files.")

if __name__ == "__main__":
    generate_test_files("need-oranganize-folder", 550)
