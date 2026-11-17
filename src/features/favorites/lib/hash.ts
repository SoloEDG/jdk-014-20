import type {
  ComicPage,
  Panel,
} from "../../../shared/document";

/**
 * 轻量感知哈希（dHash 变体）：
 * 把页面图像降采样到 17×16 灰度，比较相邻像素亮度得到 256 bit 指纹。
 * 同一张图缩放/轻微压缩后哈希基本不变；替换画面会明显不同。
 * 所有导入图都是 dataURL，同域可直接绘制，不依赖网络。
 */
const HASH_W = 17;
const HASH_H = 16;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("图像无法解码"));
    img.src = src;
  });
}

export async function imageHash(src: string): Promise<string> {
  const img = await loadImage(src);
  const canvas = document.createElement("canvas");
  canvas.width = HASH_W;
  canvas.height = HASH_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  ctx.drawImage(img, 0, 0, HASH_W, HASH_H);
  const { data } = ctx.getImageData(0, 0, HASH_W, HASH_H);
  const gray: number[] = [];
  for (let i = 0; i < data.length; i += 4)
    gray.push(0.299 * data[i]! + 0.587 * data[i + 1]! + 0.114 * data[i + 2]!);
  let bits = "";
  for (let row = 0; row < HASH_H; row++)
    for (let col = 0; col < HASH_H; col++) {
      const left = gray[row * HASH_W + col]!;
      const right = gray[row * HASH_W + col + 1]!;
      bits += right >= left ? "1" : "0";
    }
  // 每 8 bit 压成一个字节的十六进制，缩短存储长度
  let hex = "";
  for (let i = 0; i < bits.length; i += 8)
    hex += Number.parseInt(bits.slice(i, i + 8), 2)
      .toString(16)
      .padStart(2, "0");
  return hex;
}

/** 海明距离：0 表示完全一致，越大差异越大 */
export function hashDistance(a: string, b: string): number {
  if (!a || !b || a.length !== b.length) return Number.MAX_SAFE_INTEGER;
  let dist = 0;
  for (let i = 0; i < a.length; i++) {
    let x = parseInt(a[i]!, 16) ^ parseInt(b[i]!, 16);
    while (x) {
      dist += x & 1;
      x >>= 1;
    }
  }
  return dist;
}

/** 结构指纹：分镜几何与文本/声音配置。几何或分镜内容被编辑即变化 */
export function panelFingerprint(panel: Panel): string {
  const r = panel.rect;
  return [
    Math.round(r.x),
    Math.round(r.y),
    Math.round(r.width),
    Math.round(r.height),
    panel.dialogue,
    panel.speaker,
    panel.sound,
    panel.duration,
  ].join("|");
}

const hashCache = new Map<string, string>();

export async function hashPage(page: ComicPage): Promise<string> {
  const cached = hashCache.get(page.image);
  if (cached !== undefined) return cached;
  try {
    const hash = await imageHash(page.image);
    hashCache.set(page.image, hash);
    return hash;
  } catch {
    return "";
  }
}

/** 测试或重置时清空缓存 */
export function clearHashCache() {
  hashCache.clear();
}
