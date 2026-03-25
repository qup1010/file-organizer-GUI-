import { RuntimeStatus } from "@/components/runtime-status";
import { SessionLauncher } from "@/components/session-launcher";
import { SessionHistory } from "@/components/session-history";

export default function HomePage() {
  return (
    <div className="flex-1 overflow-y-auto bg-surface scroll-smooth pb-6 scrollbar-thin lg:overflow-hidden lg:pb-0">
      <div className="mx-auto grid w-full max-w-[1080px] gap-3 px-3 pt-3 lg:h-full lg:grid-cols-[minmax(0,0.98fr)_minmax(360px,1.02fr)] lg:items-stretch lg:gap-3 lg:px-4 lg:pt-4 xl:max-w-[1120px]">
        <section className="min-w-0 lg:h-full lg:min-h-0">
          <SessionLauncher />
        </section>
        <aside className="min-w-0 space-y-3 lg:grid lg:h-full lg:min-h-0 lg:grid-rows-[minmax(0,1fr)_auto] lg:space-y-0">
          <SessionHistory />
          <div className="lg:mt-3">
            <RuntimeStatus />
          </div>
        </aside>
      </div>
    </div>
  );
}
