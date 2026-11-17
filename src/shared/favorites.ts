import type { Rect, ReadingLocation } from "./document";

/** 格内归一化区域：所有值都在 0–1 之间，相对于所属分镜 rect */
export interface RegionRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** 收藏状态：坐标对当前画面是否仍然可信 */
export type FavoriteStatus = "accurate" | "stale";

/** 失效原因，用于界面提示，绝不静默套用旧坐标 */
export type StaleReason =
  | "panel-missing"
  | "panel-geometry"
  | "panel-content"
  | "image-replaced";

export interface Favorite {
  id: string;
  label: string;
  note: string;
  collectionId: string;
  location: ReadingLocation;
  /** 格内归一化区域，重定位只改这一条记录，不影响同集其他收藏 */
  region: RegionRect;
  status: FavoriteStatus;
  staleReason: StaleReason | null;
  /** 创建时所属分镜的结构指纹：rect/对白/声音等 */
  panelFingerprint: string;
  /** 创建时页面图像的感知哈希，用于判断图像内容是否已变 */
  imageHash: string;
  /** 可选证据缩略图（dataURL），与坐标解耦，可单独清理 */
  evidence: string | null;
  created: number;
  updated: number;
}

export interface FavoriteCollection {
  id: string;
  name: string;
  created: number;
}

export interface FavoriteSettings {
  /** 是否保留证据缩略图 */
  keepEvidence: boolean;
  /** 证据缩略图总容量上限（字节，按 dataURL 字符数估算） */
  evidenceQuota: number;
}

export interface EvictionImpact {
  favoriteId: string;
  label: string;
  collectionName: string;
  bytes: number;
}

export const DEFAULT_SETTINGS: FavoriteSettings = {
  keepEvidence: true,
  evidenceQuota: 2 * 1024 * 1024,
};

export function regionToRect(region: RegionRect, panel: Rect): Rect {
  return {
    x: panel.x + region.x * panel.width,
    y: panel.y + region.y * panel.height,
    width: region.width * panel.width,
    height: region.height * panel.height,
  };
}

export function rectToRegion(rect: Rect, panel: Rect): RegionRect {
  const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
  return {
    x: clamp01((rect.x - panel.x) / panel.width),
    y: clamp01((rect.y - panel.y) / panel.height),
    width: clamp01(rect.width / panel.width),
    height: clamp01(rect.height / panel.height),
  };
}

export function clampRegion(region: RegionRect): RegionRect {
  const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
  const x = clamp01(region.x),
    y = clamp01(region.y);
  return {
    x,
    y,
    width: clamp01(Math.min(region.width, 1 - x)),
    height: clamp01(Math.min(region.height, 1 - y)),
  };
}

export function estimateBytes(dataUrl: string | null): number {
  if (!dataUrl) return 0;
  // dataURL 为 UTF-16 字符串，localStorage 按 UTF-16 码元计 2 字节/字符
  return dataUrl.length * 2;
}
