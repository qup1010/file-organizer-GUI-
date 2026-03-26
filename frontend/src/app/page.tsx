import { SessionLauncher } from "@/components/session-launcher";

export default function HomePage() {
  return (
    <div className="flex-1 overflow-y-auto bg-surface scroll-smooth pb-6 scrollbar-thin">
      <div className="mx-auto flex min-w-0 w-full max-w-[1880px] flex-col gap-3 px-3 pt-3 min-[1440px]:gap-4 min-[1440px]:px-4 min-[1440px]:pt-4">
        <section className="min-w-0 flex flex-col">
          <SessionLauncher />
        </section>
      </div>
    </div>
  );
}
