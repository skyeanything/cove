import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { ALL_TOOL_INFOS, type ToolInfo } from "@/lib/ai/tools/tool-meta";
import { AGENT_TOOLS, getAgentTools } from "@/lib/ai/tools/index";
import { isOfficellmAvailable } from "@/lib/ai/officellm-detect";
import { getEnabledSkillNames } from "@/stores/skillsStore";

/** Extract the first sentence from a tool description (before the first period+space or newline). */
function firstSentence(desc: string | undefined): string {
  if (!desc) return "";
  const match = desc.match(/^[^.]*\./);
  return match ? match[0] : desc;
}

export function ToolsPage() {
  const { t } = useTranslation();
  const [activeToolIds, setActiveToolIds] = useState<Set<string>>(new Set());
  const [descriptions, setDescriptions] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [enabledSkills, officellm] = await Promise.all([
        getEnabledSkillNames(),
        isOfficellmAvailable(),
      ]);
      if (cancelled) return;

      const tools = getAgentTools(enabledSkills, { officellm });
      setActiveToolIds(new Set(Object.keys(tools)));

      // Build description map: active tool → AGENT_TOOLS → ToolInfo fallback
      const descs: Record<string, string> = {};
      for (const info of ALL_TOOL_INFOS) {
        const activeTool = tools[info.id];
        const staticTool = (AGENT_TOOLS as Record<string, { description?: string }>)[info.id];
        const raw = activeTool?.description ?? staticTool?.description ?? info.description;
        descs[info.id] = firstSentence(raw);
      }
      setDescriptions(descs);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  const core = ALL_TOOL_INFOS.filter((i) => i.category === "core");
  const extension = ALL_TOOL_INFOS.filter((i) => i.category === "extension");

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
        {t("tools.loading")}
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col overflow-auto">
      <ToolGroup label="Core" tools={core} activeIds={activeToolIds} descriptions={descriptions} />
      <ToolGroup label="Extension" tools={extension} activeIds={activeToolIds} descriptions={descriptions} />
    </div>
  );
}

function ToolGroup({
  label,
  tools,
  activeIds,
  descriptions,
}: {
  label: string;
  tools: ToolInfo[];
  activeIds: Set<string>;
  descriptions: Record<string, string>;
}) {
  if (tools.length === 0) return null;

  return (
    <div className="px-5 py-3">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </h3>
      <div className="divide-y divide-border rounded-xl border">
        {tools.map((info) => (
          <ToolRow
            key={info.id}
            info={info}
            active={activeIds.has(info.id)}
            description={descriptions[info.id] ?? ""}
          />
        ))}
      </div>
    </div>
  );
}

function ToolRow({
  info,
  active,
  description,
}: {
  info: ToolInfo;
  active: boolean;
  description: string;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      {/* Status dot */}
      <span
        className={`inline-block size-2 shrink-0 rounded-full ${active ? "bg-success" : "bg-foreground-tertiary"}`}
      />

      {/* Name + description */}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium leading-tight">{info.name}</p>
        {description && (
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {description}
          </p>
        )}
      </div>
    </div>
  );
}
