import { cn } from "@/lib/utils";
import { Wand2, Wrench, Blocks, Bot } from "lucide-react";
import type { ComponentType } from "react";
import { useExtensionStore, type ExtensionNav } from "@/stores/extensionStore";

interface NavItem {
  id: ExtensionNav;
  icon: ComponentType<{ className?: string; strokeWidth?: number }>;
  label: string;
}

const NAV_ITEMS: NavItem[] = [
  { id: "skills", icon: Wand2, label: "Skills" },
  { id: "tools", icon: Wrench, label: "Tools" },
  { id: "connectors", icon: Blocks, label: "Connectors" },
  { id: "subagent", icon: Bot, label: "SubAgents" },
];

export function ExtNavPanel() {
  const activeNav = useExtensionStore((s) => s.activeNav);
  const setActiveNav = useExtensionStore((s) => s.setActiveNav);
  const setSelectedKey = useExtensionStore((s) => s.setSelectedKey);

  const handleNav = (id: ExtensionNav) => {
    setActiveNav(id);
    setSelectedKey(null); // clear selection when switching nav
  };

  return (
    <div className="flex w-[160px] shrink-0 flex-col border-r border-border bg-background-secondary">
      <div className="px-2 pt-4">
        <nav className="flex flex-col gap-0.5">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              onClick={() => handleNav(item.id)}
              className={cn(
                "flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] transition-colors duration-150",
                activeNav === item.id
                  ? "bg-background-tertiary font-medium text-foreground"
                  : "text-foreground-secondary hover:bg-background-tertiary hover:text-foreground",
              )}
            >
              <item.icon className="size-[15px] shrink-0" strokeWidth={1.5} />
              {item.label}
            </button>
          ))}
        </nav>
      </div>
    </div>
  );
}
