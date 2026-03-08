import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { mcpServerRepo } from "@/db/repos/mcpServerRepo";
import type { McpServer } from "@/db/types";
import { useExtensionStore } from "@/stores/extensionStore";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** If provided, dialog opens in edit mode with pre-filled values */
  initialServer?: McpServer;
}

export function CreateMcpDialog({ open, onOpenChange, initialServer }: Props) {
  const bumpConnectors = useExtensionStore((s) => s.bumpConnectors);
  const [name, setName] = useState("");
  const [type, setType] = useState<McpServer["type"]>("stdio");
  const [command, setCommand] = useState("");
  const [args, setArgs] = useState("");
  const [url, setUrl] = useState("");
  const [env, setEnv] = useState("");
  const [autoRun, setAutoRun] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const isEdit = !!initialServer;

  useEffect(() => {
    if (open) {
      if (initialServer) {
        setName(initialServer.name);
        setType(initialServer.type);
        setCommand(initialServer.command ?? "");
        setArgs(initialServer.args ?? "");
        setUrl(initialServer.url ?? "");
        setEnv(initialServer.env ?? "");
        setAutoRun(!!initialServer.auto_run);
      } else {
        setName(""); setType("stdio"); setCommand(""); setArgs("");
        setUrl(""); setEnv(""); setAutoRun(false);
      }
      setError("");
    }
  }, [open, initialServer]);

  const handleSave = async () => {
    if (!name.trim()) { setError("名称不能为空"); return; }
    if (type === "stdio" && !command.trim()) { setError("stdio 类型必须填写命令"); return; }
    if (type !== "stdio" && !url.trim()) { setError("请填写服务 URL"); return; }
    setSaving(true);
    setError("");
    try {
      if (isEdit && initialServer) {
        await mcpServerRepo.update(initialServer.id, {
          name: name.trim(),
          type,
          command: type === "stdio" ? command.trim() || undefined : undefined,
          args: type === "stdio" ? args.trim() || undefined : undefined,
          url: type !== "stdio" ? url.trim() : undefined,
          env: env.trim() || undefined,
          auto_run: autoRun ? 1 : 0,
        });
      } else {
        await mcpServerRepo.create({
          id: crypto.randomUUID(),
          name: name.trim(),
          type,
          command: type === "stdio" ? command.trim() : undefined,
          args: type === "stdio" ? args.trim() || undefined : undefined,
          url: type !== "stdio" ? url.trim() : undefined,
          env: env.trim() || undefined,
          auto_run: autoRun ? 1 : 0,
          long_running: 0,
          enabled: 1,
        });
      }
      bumpConnectors();
      onOpenChange(false);
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex flex-col gap-0 p-0 sm:max-w-2xl max-h-[85vh] overflow-hidden">
        {/* Header */}
        <DialogHeader className="shrink-0 px-6 pt-6 pb-4">
          <DialogTitle>{isEdit ? "编辑 Connector" : "新建 Connector"}</DialogTitle>
          <DialogDescription className="sr-only">
            {isEdit ? "编辑 MCP Server" : "新建 MCP Server"}
          </DialogDescription>
        </DialogHeader>

        {/* Scrollable form body */}
        <div className="flex-1 overflow-y-auto px-6 pb-2 min-h-0">
          <div className="flex flex-col gap-4">
            <div className="flex gap-3">
              <div className="flex-1">
                <Label className="mb-1.5 block text-[12px]">
                  名称 <span className="text-destructive">*</span>
                </Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="my-mcp-server"
                  className="text-[13px]"
                  autoFocus
                />
              </div>
              <div className="w-[168px]">
                <Label className="mb-1.5 block text-[12px]">传输类型</Label>
                <Select value={type} onValueChange={(v) => setType(v as McpServer["type"])}>
                  <SelectTrigger className="h-8 text-[13px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="stdio">stdio</SelectItem>
                    <SelectItem value="sse">SSE</SelectItem>
                    <SelectItem value="streamable-http">Streamable HTTP</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {type === "stdio" ? (
              <div className="flex gap-3">
                <div className="w-[96px]">
                  <Label className="mb-1.5 block text-[12px]">
                    命令 <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    value={command}
                    onChange={(e) => setCommand(e.target.value)}
                    placeholder="npx"
                    className="font-mono text-[13px]"
                  />
                </div>
                <div className="flex-1">
                  <Label className="mb-1.5 block text-[12px]">参数</Label>
                  <Input
                    value={args}
                    onChange={(e) => setArgs(e.target.value)}
                    placeholder="-y @modelcontextprotocol/server-xxx"
                    className="font-mono text-[13px]"
                  />
                </div>
              </div>
            ) : (
              <div>
                <Label className="mb-1.5 block text-[12px]">
                  URL <span className="text-destructive">*</span>
                </Label>
                <Input
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="http://localhost:3000/mcp"
                  className="font-mono text-[13px]"
                />
              </div>
            )}

            <div>
              <Label className="mb-1.5 block text-[12px]">环境变量</Label>
              <Textarea
                value={env}
                onChange={(e) => setEnv(e.target.value)}
                placeholder={"API_KEY=your_key\nBASE_URL=https://..."}
                rows={3}
                className="resize-none font-mono text-[12px] leading-relaxed"
              />
              <p className="mt-1 text-[11px] text-foreground-tertiary">每行一个，格式：KEY=value</p>
            </div>

            <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5">
              <div className="flex flex-col gap-0.5">
                <span className="text-[13px] text-foreground">自动启动</span>
                <span className="text-[11px] text-foreground-tertiary">
                  应用启动时自动运行此服务
                </span>
              </div>
              <Switch checked={autoRun} onCheckedChange={setAutoRun} />
            </div>

            {error && <p className="text-[12px] text-destructive">{error}</p>}
          </div>
        </div>

        {/* Footer */}
        <DialogFooter className="shrink-0 border-t border-border px-6 py-4">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button size="sm" onClick={() => void handleSave()} disabled={saving}>
            {saving ? (isEdit ? "保存中..." : "创建中...") : (isEdit ? "保存" : "创建")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
