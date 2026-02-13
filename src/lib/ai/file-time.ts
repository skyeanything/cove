/**
 * 按会话记录文件读取时间戳，供 write/edit 做 read-before-write 校验（#25）。
 * 仅内存存储，会话切换后不持久化。
 */
const store = new Map<string, Map<string, number>>();

function getSessionMap(sessionId: string): Map<string, number> {
  let m = store.get(sessionId);
  if (!m) {
    m = new Map();
    store.set(sessionId, m);
  }
  return m;
}

/** 记录某文件在本会话中被读取的时间（用于后续 write/edit 校验） */
export function recordRead(sessionId: string, filePath: string): void {
  getSessionMap(sessionId).set(filePath, Date.now());
}

/** 获取某文件在本会话中上次被读取的时间戳 */
export function getReadTime(sessionId: string, filePath: string): number | undefined {
  return getSessionMap(sessionId).get(filePath);
}

/** write/edit 前校验：文件须在本会话中读过且未被外部修改（#25 使用） */
export function assertReadBeforeWrite(
  sessionId: string,
  filePath: string,
  currentMtimeSecs: number,
): { ok: boolean; message?: string } {
  const readAt = getReadTime(sessionId, filePath);
  if (readAt == null) {
    return { ok: false, message: `文件 ${filePath} 尚未在本会话中读取，请先使用 read 工具读取后再编辑。` };
  }
  const readAtSecs = Math.floor(readAt / 1000);
  if (currentMtimeSecs > readAtSecs) {
    return { ok: false, message: `文件 ${filePath} 自上次读取后已被修改，请重新读取后再编辑。` };
  }
  return { ok: true };
}
