import { RuntimeStatus } from "@/components/runtime-status";
import { SessionLauncher } from "@/components/session-launcher";
import { SessionHistory } from "@/components/session-history";

export default function HomePage() {
  return (
    <div className="flex-1 overflow-y-auto bg-surface scroll-smooth pb-8 scrollbar-thin">
      <div className="mx-auto w-full max-w-[1120px] space-y-6 px-4 pt-5 lg:px-5 lg:pt-6">
        <SessionLauncher />
        <SessionHistory />
        <RuntimeStatus />
      </div>
    </div>
  );
}
