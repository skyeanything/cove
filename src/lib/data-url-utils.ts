/** 将 data URL 转为 ArrayBuffer */
export function dataUrlToArrayBuffer(dataUrl: string): ArrayBuffer {
  const base64 = dataUrl.replace(/^data:[^;]+;base64,/, "");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

/** 将 data URL 转为 Blob */
export function dataUrlToBlob(dataUrl: string): Blob {
  const arr = dataUrl.split(",");
  const mime = (arr[0]?.match(/:(.*?);/)?.[1] ?? "application/octet-stream") as string;
  const base64 = arr[1];
  if (!base64) throw new Error("Invalid data URL");
  const bstr = atob(base64);
  const u8 = new Uint8Array(bstr.length);
  for (let i = 0; i < bstr.length; i++) u8[i] = bstr.charCodeAt(i);
  return new Blob([u8], { type: mime });
}
