import { useDataStore } from "@/stores/dataStore";
import { useSettingsStore } from "@/stores/settingsStore";
import type { SelectedProvider } from "@/stores/settingsStore";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Plus, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  BUILTIN_PROVIDER_TYPES,
  PROVIDER_METAS,
} from "@/lib/ai/provider-meta";
import type { ProviderType } from "@/db/types";
import { ProviderForm } from "./ProviderForm";
import { ProviderIcon } from "@/components/common/ProviderIcon";

export function ProvidersPage() {
  const providers = useDataStore((s) => s.providers);
  const createProvider = useDataStore((s) => s.createProvider);
  const deleteProvider = useDataStore((s) => s.deleteProvider);
  const selected = useSettingsStore((s) => s.selectedProvider);
  const setSelectedProvider = useSettingsStore((s) => s.setSelectedProvider);

  const customProviders = providers.filter((p) => p.type === "custom");

  const isSelectedCustom = selected?.type === "custom" && !!selected.id;

  async function handleAddCustom() {
    const id = crypto.randomUUID();
    await createProvider({
      id,
      name: "Custom Provider",
      type: "custom" as ProviderType,
      enabled: 1,
    });
    setSelectedProvider({ type: "custom", id });
  }

  async function handleRemoveSelected() {
    if (!selected?.id) return;
    const provider = providers.find((p) => p.id === selected.id);
    if (provider) {
      await deleteProvider(provider.id);
    }
    setSelectedProvider({ type: "deepseek" });
  }

  function isActive(sel: SelectedProvider | null, type: ProviderType, id?: string): boolean {
    if (!sel) return false;
    if (id) return sel.id === id;
    return sel.type === type && !sel.id;
  }

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* Left: Provider list */}
      <div className="flex w-[180px] shrink-0 flex-col border-r">
        <ScrollArea className="flex-1 pt-2">
          <div className="flex flex-col gap-0.5 px-2">
            {/* Built-in providers */}
            {BUILTIN_PROVIDER_TYPES.map((type) => {
              const meta = PROVIDER_METAS[type];
              const configured = providers.find((p) => p.type === type);
              const active = isActive(selected, type);
              return (
                <button
                  key={type}
                  onClick={() => setSelectedProvider({ type })}
                  className={cn(
                    "flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors duration-150",
                    active
                      ? "bg-accent text-accent-foreground"
                      : "text-foreground hover:bg-background-tertiary",
                  )}
                >
                  <ProviderIcon type={type} />
                  <span className="flex-1 truncate">{meta.displayName}</span>
                  {configured && configured.api_key && (
                    <span
                      className={cn(
                        "size-1.5 shrink-0 rounded-full",
                        active ? "bg-accent-foreground/50" : "bg-success",
                      )}
                    />
                  )}
                </button>
              );
            })}

            {/* Custom providers separator */}
            {customProviders.length > 0 && (
              <div className="my-1 border-t" />
            )}

            {/* Custom providers */}
            {customProviders.map((p) => {
              const active = isActive(selected, p.type, p.id);
              return (
                <button
                  key={p.id}
                  onClick={() => setSelectedProvider({ type: p.type, id: p.id })}
                  className={cn(
                    "flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors duration-150",
                    active
                      ? "bg-accent text-accent-foreground"
                      : "text-foreground hover:bg-background-tertiary",
                  )}
                >
                  <ProviderIcon type={p.type} />
                  <span className="flex-1 truncate">
                    {p.name || "Custom Provider"}
                  </span>
                  {p.api_key && (
                    <span
                      className={cn(
                        "size-1.5 shrink-0 rounded-full",
                        active ? "bg-accent-foreground/50" : "bg-success",
                      )}
                    />
                  )}
                </button>
              );
            })}
          </div>
        </ScrollArea>

        {/* Bottom toolbar: + / - */}
        <div className="flex items-center gap-0.5 border-t px-2 py-1.5">
          <Button
            variant="ghost"
            size="icon-sm"
            className="size-7"
            onClick={handleAddCustom}
          >
            <Plus className="size-3.5" strokeWidth={1.5} />
          </Button>

          {isSelectedCustom ? (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="icon-sm" className="size-7">
                  <Minus className="size-3.5" strokeWidth={1.5} />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Remove provider?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently remove this provider configuration.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleRemoveSelected}>
                    Remove
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          ) : (
            <Button
              variant="ghost"
              size="icon-sm"
              className="size-7"
              disabled
            >
              <Minus className="size-3.5" strokeWidth={1.5} />
            </Button>
          )}
        </div>
      </div>

      {/* Right: Config form */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {selected ? (
          <ProviderForm providerType={selected.type} providerId={selected.id} />
        ) : (
          <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
            Select a provider to configure
          </div>
        )}
      </div>
    </div>
  );
}
