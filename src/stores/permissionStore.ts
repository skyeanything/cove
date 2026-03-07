import { create } from "zustand";

/**
 * 权限模型：write/edit 默认允许（由工具内 read-before-write 保证）；
 * bash 分级：safe 直接执行、confirm 弹窗、block 拒绝；支持会话级「记住同类命令」按首词指纹。
 *
 * 使用队列而非单槽位，避免模型在同一步中发出多个工具调用时
 * 后来者覆盖前者的权限请求导致前者 Promise 永远不 resolve。
 */

export type PermissionOperation = "write" | "edit" | "bash";

export type PermissionChoice = "allow" | "deny" | "always_allow";

export interface PendingPermission {
  conversationId: string;
  operation: PermissionOperation;
  pathOrCommand: string;
  /** bash 时为首词指纹，用于「记住同类命令」 */
  bashPattern?: string;
  resolve: (choice: PermissionChoice) => void;
}

/** 从命令字符串取首词作为指纹（同类命令如 curl/wget 等） */
export function getBashCommandPattern(command: string): string {
  const t = command.trim().split(/\s+/)[0] ?? "";
  return t.toLowerCase();
}

interface PermissionState {
  /** 当前展示给用户的权限请求（队列头部） */
  pendingAsk: PendingPermission | null;
  /** 等待中的权限请求队列（不含当前展示的） */
  pendingQueue: PendingPermission[];
  /** bash 会话级已允许的命令首词 */
  allowedBashPatterns: Record<string, Set<string>>;
  /** 开启信任模式的会话 ID 集合 */
  trustModeConversations: Set<string>;
  /** AI 请求开启信任模式时的待确认项（需用户确认） */
  pendingTrustModeRequest: { conversationId: string; resolve: (approved: boolean) => void } | null;

  ask: (
    conversationId: string,
    operation: PermissionOperation,
    pathOrCommand: string,
    options?: { bashPattern?: string },
  ) => Promise<boolean>;

  respond: (choice: PermissionChoice) => void;

  enableTrustMode: (conversationId: string) => void;
  disableTrustMode: (conversationId: string) => void;
  isTrustMode: (conversationId: string) => boolean;
  /** AI 请求启用信任模式，返回 Promise 等待用户确认 */
  requestTrustMode: (conversationId: string) => Promise<boolean>;
  resolveTrustModeRequest: (approved: boolean) => void;
}

export const usePermissionStore = create<PermissionState>()((setState, get) => ({
  pendingAsk: null,
  pendingQueue: [],
  allowedBashPatterns: {},
  trustModeConversations: new Set<string>(),
  pendingTrustModeRequest: null,

  ask: (conversationId, operation, pathOrCommand, options) => {
    if (operation === "bash" && options?.bashPattern) {
      const patterns = get().allowedBashPatterns[conversationId];
      if (patterns?.has(options.bashPattern)) {
        return Promise.resolve(true);
      }
    }
    // Trust mode: auto-approve all confirmable operations
    if (get().trustModeConversations.has(conversationId)) {
      return Promise.resolve(true);
    }
    return new Promise<boolean>((resolve) => {
      const bashPattern = operation === "bash" ? (options?.bashPattern ?? getBashCommandPattern(pathOrCommand)) : undefined;
      const entry: PendingPermission = {
        conversationId,
        operation,
        pathOrCommand,
        bashPattern,
        resolve: (choice: PermissionChoice) => {
          if (choice === "always_allow" && operation === "bash" && bashPattern) {
            const prev = get().allowedBashPatterns;
            const set = prev[conversationId] ?? new Set<string>();
            set.add(bashPattern);
            setState({ allowedBashPatterns: { ...prev, [conversationId]: set } });
          }
          resolve(choice !== "deny");
        },
      };

      const { pendingAsk } = get();
      if (pendingAsk === null) {
        // 当前无展示 → 直接展示
        setState({ pendingAsk: entry });
      } else {
        // 已有展示 → 排队等待
        setState((state) => ({ pendingQueue: [...state.pendingQueue, entry] }));
      }
    });
  },

  respond: (choice) => {
    const { pendingAsk, pendingQueue } = get();
    if (!pendingAsk) return;

    // 解决当前权限请求
    pendingAsk.resolve(choice);

    // 弹出队列中下一个（如果有）
    if (pendingQueue.length > 0) {
      const [next, ...rest] = pendingQueue;
      setState({ pendingAsk: next, pendingQueue: rest });
    } else {
      setState({ pendingAsk: null, pendingQueue: [] });
    }
  },

  enableTrustMode: (conversationId) => {
    const next = new Set(get().trustModeConversations);
    next.add(conversationId);
    setState({ trustModeConversations: next });
  },

  disableTrustMode: (conversationId) => {
    const next = new Set(get().trustModeConversations);
    next.delete(conversationId);
    setState({ trustModeConversations: next });
  },

  isTrustMode: (conversationId) => {
    return get().trustModeConversations.has(conversationId);
  },

  requestTrustMode: (conversationId) => {
    return new Promise<boolean>((resolve) => {
      setState({ pendingTrustModeRequest: { conversationId, resolve } });
    });
  },

  resolveTrustModeRequest: (approved) => {
    const req = get().pendingTrustModeRequest;
    if (!req) return;
    if (approved) {
      const next = new Set(get().trustModeConversations);
      next.add(req.conversationId);
      setState({ trustModeConversations: next, pendingTrustModeRequest: null });
    } else {
      setState({ pendingTrustModeRequest: null });
    }
    req.resolve(approved);
  },
}));
