import type { ComicDocument } from "../../../shared/document";
import type { Favorite, FavoriteStatus, StaleReason } from "../../../shared/favorites";
import { hashDistance, hashPage, panelFingerprint } from "./hash";

/** 256 bit 感知哈希允许的最大海明距离，超过即判定画面已变 */
const HASH_THRESHOLD = 12;

export interface ReconcileSummary {
  accurate: number;
  stale: number;
  reasons: Record<StaleReason, number>;
}

function findPanel(doc: ComicDocument, favorite: Favorite) {
  for (const chapter of doc.chapters)
    for (const page of chapter.pages) {
      if (page.id !== favorite.location.pageId) continue;
      const panel = page.panels.find((p) => p.id === favorite.location.panelId);
      return { chapter, page, panel };
    }
  return { chapter: undefined, page: undefined, panel: undefined };
}

/**
 * 编辑后核对：只更新状态与原因，绝不修改 region 坐标。
 * - 分镜/页被删除：panel-missing
 * - 分镜 rect 被裁切：panel-geometry（旧坐标不能再信）
 * - 对白/声音等分镜内容变更：panel-content
 * - 页面图像被替换且感知哈希超阈值：image-replaced
 * 历史数据指纹为空时先回填，不误报失效。
 */
export async function reconcileFavorites(
  doc: ComicDocument,
  favorites: Favorite[],
): Promise<{ favorites: Favorite[]; summary: ReconcileSummary }> {
  const pageHashes = new Map<string, string>();
  const next: Favorite[] = [];
  const summary: ReconcileSummary = {
    accurate: 0,
    stale: 0,
    reasons: {
      "panel-missing": 0,
      "panel-geometry": 0,
      "panel-content": 0,
      "image-replaced": 0,
    },
  };
  for (const favorite of favorites) {
    const item: Favorite = { ...favorite };
    const { page, panel } = findPanel(doc, item);
    let status: FavoriteStatus = "accurate";
    let reason: StaleReason | null = null;
    if (!page || !panel) {
      status = "stale";
      reason = "panel-missing";
    } else {
      const currentFingerprint = panelFingerprint(panel);
      if (!item.panelFingerprint) {
        // 旧版本数据回填，不判定失效
        item.panelFingerprint = currentFingerprint;
      } else if (currentFingerprint !== item.panelFingerprint) {
        const oldRect = item.panelFingerprint.split("|").slice(0, 4).join("|");
        const newRect = currentFingerprint.split("|").slice(0, 4).join("|");
        status = "stale";
        reason = oldRect !== newRect ? "panel-geometry" : "panel-content";
      }
      if (status === "accurate") {
        let hash = pageHashes.get(page.id);
        if (hash === undefined) {
          hash = await hashPage(page);
          pageHashes.set(page.id, hash);
        }
        if (!item.imageHash) {
          item.imageHash = hash;
        } else if (hash && hashDistance(item.imageHash, hash) > HASH_THRESHOLD) {
          status = "stale";
          reason = "image-replaced";
        }
      }
    }
    item.status = status;
    item.staleReason = reason;
    if (status === "accurate") summary.accurate += 1;
    else {
      summary.stale += 1;
      if (reason) summary.reasons[reason] += 1;
    }
    next.push(item);
  }
  return { favorites: next, summary };
}

export const STALE_REASON_LABEL: Record<StaleReason, string> = {
  "panel-missing": "原分镜已被删除或移走",
  "panel-geometry": "分镜裁切后坐标已失效",
  "panel-content": "分镜内容已被修改",
  "image-replaced": "页面图像已替换，旧坐标未迁移",
};
