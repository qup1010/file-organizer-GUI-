class CLI:
    GREY = "\033[90m"
    GREEN = "\033[92m"
    YELLOW = "\033[93m"
    BLUE = "\033[94m"
    RESET = "\033[0m"
    BOLD = "\033[1m"

    @staticmethod
    def panel(title, content="", color=GREEN):
        print(f"\n{CLI.BOLD}{color}--- {title} ---{CLI.RESET}")
        if content:
            print(content)
