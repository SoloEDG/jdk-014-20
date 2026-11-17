import type { Rect } from "../../../shared/document";
import type { RegionRect } from "../../../shared/favorites";

const MIN_SIDE = 0.03;

/** 把页面像素坐标的选区裁出格内归一化区域，并保证最小可选尺寸 */
export function regionFromPageRect(
  selection: Rect,
  panel: Rect,
): RegionRect | null {
  const overlap: Rect = {
    x: Math.max(selection.x, panel.x),
    y: Math.max(selection.y, panel.y),
    width:
      Math.min(selection.x + selection.width, panel.x + panel.width) -
      Math.max(selection.x, panel.x),
    height:
      Math.min(selection.y + selection.height, panel.y + panel.height) -
      Math.max(selection.y, panel.y),
  };
  if (
    overlap.width < panel.width * MIN_SIDE ||
    overlap.height < panel.height * MIN_SIDE
  )
    return null;
  return {
    x: (overlap.x - panel.x) / panel.width,
    y: (overlap.y - panel.y) / panel.height,
    width: overlap.width / panel.width,
    height: overlap.height / panel.height,
  };
}

/** 浏览器视口坐标（相对 comic-image 元素）+ 当前帧的页面像素映射 → 页面像素 rect */
export function pageRectFromElement(
  el: HTMLElement,
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  pageWidth: number,
  pageHeight: number,
): Rect {
  const box = el.getBoundingClientRect();
  const sx = ((startX - box.left) / box.width) * pageWidth;
  const sy = ((startY - box.y) / box.height) * pageHeight;
  const ex = ((endX - box.left) / box.width) * pageWidth;
  const ey = ((endY - box.y) / box.height) * pageHeight;
  return {
    x: Math.max(0, Math.min(pageWidth, Math.min(sx, ex))),
    y: Math.max(0, Math.min(pageHeight, Math.min(sy, ey))),
    width: Math.abs(ex - sx),
    height: Math.abs(ey - sy),
  };
}

/** 把格内归一化区域转回页面像素 rect（用于框选回显与重定位框） */
export function regionToPageRect(region: RegionRect, panel: Rect): Rect {
  return {
    x: panel.x + region.x * panel.width,
    y: panel.y + region.y * panel.height,
    width: region.width * panel.width,
    height: region.height * panel.height,
  };
}

export function regionOverlayStyle(rect: Rect, page: {
  width: number;
  height: number;
}) {
  return {
    left: `${(rect.x / page.width) * 100}%`,
    top: `${(rect.y / page.height) * 100}%`,
    width: `${(rect.width / page.width) * 100}%`,
    height: `${(rect.height / page.height) * 100}%`,
  };
}
