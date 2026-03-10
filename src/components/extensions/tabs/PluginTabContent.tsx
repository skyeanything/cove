import { useTranslation } from "react-i18next";
import { ExtensionCard } from "../ExtensionCard";

/**
 * Plugin tab — currently only Word plugin.
 * Plugin here refers to embedding into third-party products.
 */
export function PluginTabContent() {
  const { t } = useTranslation();

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <ExtensionCard
        icon="📝"
        name="Word"
        description={t("extensions.wordPluginDesc", "Embed AI assistant into Microsoft Word for document editing assistance.")}
        badge="built-in"
        enabled={true}
        onToggle={() => {/* Word plugin toggle — future implementation */}}
      />
    </div>
  );
}
