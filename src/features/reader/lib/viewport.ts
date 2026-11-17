import type { ComicPage, Panel, ReadingMode, Rect } from "../../../shared/document";
import type { RegionRect } from "../../../shared/favorites";
import { regionToRect } from "../../../shared/favorites";

export interface FrameTarget {
  mode: ReadingMode;
  panel: Panel;
  /** 显式聚焦区域（收藏预览/框选回显），优先于 mode 决定取景框 */
  focusRegion?: RegionRect | null;
}

function frameRect(page: ComicPage, panel: Panel, target?: FrameTarget): Rect {
  if (target?.focusRegion) return regionToRect(target.focusRegion, panel.rect);
  return target && target.mode === "panel"
    ? panel.rect
    : { x: 0, y: 0, width: page.width, height: page.height };
}

export function frameStyle(
  page: ComicPage,
  panel: Panel,
  modeOrTarget: ReadingMode | FrameTarget,
) {
  const target: FrameTarget =
    typeof modeOrTarget === "string"
      ? { mode: modeOrTarget, panel }
      : modeOrTarget;
  const r = frameRect(page, panel, target);
  return {
    aspectRatio: `${r.width}/${r.height}`,
    width: "100%",
    backgroundImage: `url("${page.image}")`,
    backgroundSize: `${(page.width / r.width) * 100}% ${(page.height / r.height) * 100}%`,
    backgroundPosition: `${(r.x / (page.width - r.width || 1)) * 100}% ${(r.y / (page.height - r.height || 1)) * 100}%`,
  };
}
export function constrainPan(x: number, y: number, zoom: number) {
  const limit = (zoom - 1) * 220;
  return {
    x: Math.max(-limit, Math.min(limit, x)),
    y: Math.max(-limit, Math.min(limit, y)),
  };
}
