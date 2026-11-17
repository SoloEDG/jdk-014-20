import type {
  ComicDocument,
  ComicPage,
  Panel,
  Rect,
} from "../../../shared/document";

export interface PageRef {
  chapterId: string;
  pageId: string;
}

function findPage(doc: ComicDocument, ref: PageRef): ComicPage | undefined {
  return doc.chapters
    .find((c) => c.id === ref.chapterId)
    ?.pages.find((p) => p.id === ref.pageId);
}

function findPanel(doc: ComicDocument, pageId: string, panelId: string) {
  for (const chapter of doc.chapters)
    for (const page of chapter.pages)
      if (page.id === pageId) {
        const panel = page.panels.find((p) => p.id === panelId);
        if (panel) return { chapter, page, panel };
      }
  return { chapter: undefined, page: undefined, panel: undefined };
}

/**
 * 跨页复制分镜：保留源分镜 id 与 rect 引用，追加到目标页。
 * 保留 id 意味着指向该分镜的收藏仍能解析到同一分镜数据；
 * 若目标页画面与源页不同，图像哈希核对会把收藏标记为需重定位，
 * 不会把旧坐标静默套到新画面上。
 */
export function copyPanelAcrossPages(
  doc: ComicDocument,
  sourcePageId: string,
  panelId: string,
  target: PageRef,
): boolean {
  const source = findPanel(doc, sourcePageId, panelId);
  const targetPage = findPage(doc, target);
  if (!source.panel || !targetPage) return false;
  if (targetPage.panels.some((p) => p.id === panelId)) return false;
  const clone: Panel = {
    ...source.panel,
    rect: { ...source.panel.rect },
  };
  targetPage.panels.push(clone);
  return true;
}

function clampRect(rect: Rect, page: ComicPage): Rect {
  const width = Math.max(40, Math.min(rect.width, page.width));
  const height = Math.max(40, Math.min(rect.height, page.height));
  return {
    x: Math.max(0, Math.min(rect.x, page.width - width)),
    y: Math.max(0, Math.min(rect.y, page.height - height)),
    width,
    height,
  };
}

/**
 * 分镜裁切：修改分镜 rect。rect 变化会改变结构指纹，
 * 依赖该分镜的收藏在 reconcile 时被标记为 panel-geometry 待重定位；
 * 同一集合里指向其他分镜的收藏指纹不变，继续保持准确。
 */
export function cropPanel(
  doc: ComicDocument,
  pageId: string,
  panelId: string,
  next: Rect,
): boolean {
  const { page, panel } = findPanel(doc, pageId, panelId);
  if (!page || !panel) return false;
  panel.rect = clampRect(next, page);
  return true;
}

/**
 * 图片替换：只换页面图像与尺寸，分镜 id 保留。
 * 感知哈希变化后，该页上的收藏会被标记 image-replaced，
 * 坐标保持不动等待用户显式重定位。
 */
export async function replacePageImage(
  doc: ComicDocument,
  pageId: string,
  file: File,
): Promise<ComicPage> {
  if (!["image/png", "image/jpeg", "image/webp", "image/gif"].includes(file.type))
    throw new Error("请选择 PNG、JPG、WebP 或 GIF 图片");
  if (file.size > 8 * 1024 * 1024) throw new Error("单张图片不能超过 8 MB");
  const page = doc.chapters
    .flatMap((c) => c.pages)
    .find((p) => p.id === pageId);
  if (!page) throw new Error("目标页不存在");
  const image = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("图片读取失败"));
    reader.readAsDataURL(file);
  });
  const dimensions = await new Promise<{ width: number; height: number }>(
    (resolve, reject) => {
      const img = new Image();
      img.onload = () =>
        resolve({ width: img.naturalWidth, height: img.naturalHeight });
      img.onerror = () => reject(new Error("图片无法解码"));
      img.src = image;
    },
  );
  page.image = image;
  page.width = dimensions.width;
  page.height = dimensions.height;
  // 分镜 rect 与 id 原样保留：rect 一旦改动会被记成几何失效，
  // 图片替换的可信度完全交给感知哈希核对（image-replaced），
  // 旧坐标不会被静默套到新画面，等待用户显式重定位。
  return page;
}
