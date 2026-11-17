import type { ComicPage, Rect } from "../../../shared/document";
import type { RegionRect } from "../../../shared/favorites";
import { regionToRect, estimateBytes } from "../../../shared/favorites";

const THUMB_MAX = 160;
const JPEG_QUALITY = 0.72;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("缩略图生成失败"));
    img.src = src;
  });
}

/**
 * 证据缩略图：只截取收藏时该区域的画面，缩到最长边 160 的 JPEG dataURL。
 * 不保存整张旧图，体积可控；它仅作“当时画面”的证据，不参与坐标定位。
 */
export async function captureEvidence(
  page: ComicPage,
  panelRect: Rect,
  region: RegionRect,
): Promise<string | null> {
  try {
    const target = regionToRect(region, panelRect);
    const img = await loadImage(page.image);
    const scale = Math.min(
      1,
      THUMB_MAX / Math.max(target.width, target.height),
    );
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(target.width * scale));
    canvas.height = Math.max(1, Math.round(target.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(
      img,
      target.x,
      target.y,
      target.width,
      target.height,
      0,
      0,
      canvas.width,
      canvas.height,
    );
    return canvas.toDataURL("image/jpeg", JPEG_QUALITY);
  } catch {
    return null;
  }
}

export interface QuotaPlan {
  /** 当前证据总占用 */
  used: number;
  quota: number;
  /** 加入新证据后是否超额 */
  overflow: boolean;
  /** 超额时按最久未更新优先清理，给出清理影响预览 */
  evictions: {
    favoriteId: string;
    label: string;
    collectionName: string;
    bytes: number;
  }[];
  /** 执行清理后的占用 */
  projectedUsed: number;
}

/**
 * 容量规划：不直接删除，先让调用方拿到影响清单给用户确认。
 * evictCandidates 按 updated 升序（最久未更新先清理）。
 */
export function planQuota(
  existing: { id: string; label: string; collectionName: string; evidence: string | null; updated: number }[],
  incoming: { id: string; label: string; collectionName: string; evidence: string | null; updated: number } | null,
  quota: number,
): QuotaPlan {
  const items = [
    ...existing
      .filter((f) => f.evidence)
      .map((f) => ({
        favoriteId: f.id,
        label: f.label,
        collectionName: f.collectionName,
        bytes: estimateBytes(f.evidence),
        updated: f.updated,
      })),
  ];
  const incomingBytes = incoming?.evidence ? estimateBytes(incoming.evidence) : 0;
  let used = items.reduce((n, f) => n + f.bytes, 0);
  const total = used + incomingBytes;
  const evictions: QuotaPlan["evictions"] = [];
  if (total > quota && incomingBytes > 0) {
    const sorted = [...items].sort((a, b) => a.updated - b.updated);
    let need = total - quota;
    for (const item of sorted) {
      if (need <= 0) break;
      // 正在新增的条目自身不参与清理
      if (incoming && item.favoriteId === incoming.id) continue;
      evictions.push(item);
      need -= item.bytes;
    }
  }
  const freed = evictions.reduce((n, f) => n + f.bytes, 0);
  return {
    used,
    quota,
    overflow: total > quota,
    evictions,
    projectedUsed: Math.max(0, total - freed),
  };
}

export function totalEvidenceBytes(
  favorites: { evidence: string | null }[],
): number {
  return favorites.reduce((n, f) => n + estimateBytes(f.evidence), 0);
}
