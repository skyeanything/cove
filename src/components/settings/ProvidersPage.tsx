import { useDataStore } from "@/stores/dataStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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

/** Non-built-in types that can be added via the + button. */
const ADDABLE_TYPES: { type: ProviderType; label: string }[] = [
  { type: "custom", label: "OpenAI Compatible" },
  { type: "bedrock", label: "Amazon Bedrock" },
  { type: "github-models", label: "GitHub Models" },
];

export function ProvidersPage() {
  const providers = useDataStore((s) => s.providers);
  const createProvider = useDataStore((s) => s.createProvider);
  const deleteProvider = useDataStore((s) => s.deleteProvider);
  const selectedType = useSettingsStore((s) => s.selectedProviderType);
  const setSelectedProvider = useSettingsStore((s) => s.setSelectedProvider);

  // Custom (non-built-in) providers that have been added
  const customProviders = providers.filter(
    (p) => !PROVIDER_METAS[p.type]?.builtIn,
  );

  const selectedMeta = selectedType ? PROVIDER_METAS[selectedType] : null;
  const isSelectedCustom = selectedMeta && !selectedMeta.builtIn;

  async function handleAddCustom(type: ProviderType) {
    const meta = PROVIDER_METAS[type];
    await createProvider({
      id: crypto.randomUUID(),
      name: meta.displayName,
      type,
      enabled: 1,
    });
    setSelectedProvider(type);
  }

  async function handleRemoveSelected() {
    if (!selectedType) return;
    const provider = providers.find((p) => p.type === selectedType);
    if (provider) {
      await deleteProvider(provider.id);
    }
    setSelectedProvider("anthropic");
  }

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* Left: Provider list */}
      <div className="flex w-[220px] shrink-0 flex-col border-r">
        <ScrollArea className="flex-1 pt-2">
          <div className="flex flex-col gap-0.5 px-2">
            {/* Built-in providers */}
            {BUILTIN_PROVIDER_TYPES.map((type) => {
              const meta = PROVIDER_METAS[type];
              const configured = providers.find((p) => p.type === type);
              return (
                <button
                  key={type}
                  onClick={() => setSelectedProvider(type)}
                  className={cn(
                    "flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors duration-150",
                    selectedType === type
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
                        selectedType === type ? "bg-accent-foreground/50" : "bg-success",
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
              const meta = PROVIDER_METAS[p.type];
              return (
                <button
                  key={p.id}
                  onClick={() => setSelectedProvider(p.type)}
                  className={cn(
                    "flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors duration-150",
                    selectedType === p.type
                      ? "bg-accent text-accent-foreground"
                      : "text-foreground hover:bg-background-tertiary",
                  )}
                >
                  <ProviderIcon type={p.type} />
                  <span className="flex-1 truncate">
                    {p.name || meta.displayName}
                  </span>
                  {p.api_key && (
                    <span
                      className={cn(
                        "size-1.5 shrink-0 rounded-full",
                        selectedType === p.type ? "bg-accent-foreground/50" : "bg-success",
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
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" className="size-7">
                <Plus className="size-3.5" strokeWidth={1.5} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" side="top">
              {ADDABLE_TYPES.map((item) => (
                <DropdownMenuItem
                  key={item.type}
                  onClick={() => handleAddCustom(item.type)}
                  className="text-sm"
                >
                  {item.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

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
        {selectedType ? (
          <ProviderForm providerType={selectedType} />
        ) : (
          <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
            Select a provider to configure
          </div>
        )}
      </div>
    </div>
  );
}

