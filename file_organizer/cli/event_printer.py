from file_organizer.cli.console import CLI


def scanner_ui_handler(event_type, data):
    """处理扫描过程中的各种反馈。"""
    if event_type == "cycle_start":
        print(f"{CLI.YELLOW}[系统: 正在进行第 {data['attempt']} 次分析分析...]{CLI.RESET}")
    elif event_type == "tool_start":
        print(f"  {CLI.BLUE}➤ 工具调用: {data['name']}({data['args']}){CLI.RESET}")
    elif event_type == "ai_reasoning":
        print(f"{CLI.GREY}{data['content']}{CLI.RESET}", end="", flush=True)
    elif event_type == "ai_chunk":
        print(data['content'], end="", flush=True)
    elif event_type == "ai_streaming_start":
        print(f"  {CLI.BOLD}AI: {CLI.RESET}", end="", flush=True)
    elif event_type == "ai_streaming_end":
        print()
    elif event_type == "validation_pass":
        print(f"{CLI.GREEN}✅ 第 {data['attempt']} 次结果校验通过!{CLI.RESET}")
    elif event_type == "validation_fail":
        details = data['details']
        print(f"{CLI.YELLOW}⚠️ 第 {data['attempt']} 次校验失败!{CLI.RESET}")
        if details['missing']:
            print(f"  缺少: {details['missing']}")
        if details['extra']:
            print(f"  多余: {details['extra']}")
        if details['duplicates']:
            print(f"  重复: {details['duplicates']}")
    elif event_type == "retry_exhausted":
        print(f"{CLI.YELLOW}❌ 重试次数耗尽，本次分析未保存。{CLI.RESET}")
    elif event_type == "command_validation_pass":
        print(f"{CLI.GREEN}✅ 第 {data['attempt']} 次命令流校验通过!{CLI.RESET}")
    elif event_type == "command_validation_fail":
        details = data["details"]
        print(f"{CLI.YELLOW}⚠️ 第 {data['attempt']} 次命令流校验失败!{CLI.RESET}")
        if details["missing"]:
            print(f"  缺少 MOVE: {details['missing']}")
        if details["extra"]:
            print(f"  多余 MOVE: {details['extra']}")
        if details["duplicates"]:
            print(f"  重复条目: {details['duplicates']}")
        if details["order_errors"]:
            print(f"  顺序错误: {details['order_errors']}")
        if details["invalid_lines"]:
            print(f"  非法命令行: {details['invalid_lines']}")
        if details["path_errors"]:
            print(f"  路径错误: {details['path_errors']}")
        if details["rename_errors"]:
            print(f"  禁止重命名: {details['rename_errors']}")
        if details["duplicate_mkdirs"]:
            print(f"  重复 MKDIR: {details['duplicate_mkdirs']}")
        if details["missing_mkdirs"]:
            print(f"  缺少 MKDIR: {details['missing_mkdirs']}")
        if details["unused_mkdirs"]:
            print(f"  未使用 MKDIR: {details['unused_mkdirs']}")
        if details["conflicting_targets"]:
            print(f"  目标冲突: {details['conflicting_targets']}")
    elif event_type == "command_retry_exhausted":
        print(f"{CLI.YELLOW}❌ 命令流自动重试已耗尽，请继续给出修改意见。{CLI.RESET}")
