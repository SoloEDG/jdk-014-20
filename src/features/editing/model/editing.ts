import { ref, type Ref } from "vue";
import type { ComicDocument, Rect } from "../../../shared/document";
import {
  copyPanelAcrossPages,
  cropPanel,
  replacePageImage,
  type PageRef,
} from "../lib/operations";

export function useEditing(
  doc: Ref<ComicDocument>,
  onChanged: () => Promise<{ accurate: number; stale: number }> | void,
) {
  const busy = ref(false);
  const message = ref("");
  const cropping = ref(false);
  /** 正在裁切的分镜 id（当前页内） */
  const cropPanelId = ref("");

  function notify(accurate: number, stale: number) {
    message.value = stale
      ? `编辑完成：${accurate} 条收藏仍准确，${stale} 条需重新定位（旧坐标未迁移）`
      : `编辑完成：${accurate} 条收藏均仍准确`;
  }

  async function run(action: () => void | Promise<void>) {
    if (busy.value) return;
    busy.value = true;
    message.value = "";
    try {
      await action();
      const summary = await onChanged();
      if (summary) notify(summary.accurate, summary.stale);
    } catch (error) {
      message.value = error instanceof Error ? error.message : "编辑失败";
    } finally {
      busy.value = false;
    }
  }

  function copyToPage(
    sourcePageId: string,
    panelId: string,
    target: PageRef,
  ) {
    void run(() => {
      const ok = copyPanelAcrossPages(doc.value, sourcePageId, panelId, target);
      if (!ok) throw new Error("目标页已存在该分镜或目标不存在");
    });
  }

  function startCrop(panelId: string) {
    cropPanelId.value = panelId;
    cropping.value = true;
  }
  function cancelCrop() {
    cropping.value = false;
    cropPanelId.value = "";
  }
  function applyCrop(pageId: string, panelId: string, rect: Rect) {
    void run(() => {
      const ok = cropPanel(doc.value, pageId, panelId, rect);
      if (!ok) throw new Error("分镜不存在，裁切未生效");
    });
    cropping.value = false;
    cropPanelId.value = "";
  }

  function replaceImage(pageId: string, file: File) {
    void run(async () => {
      await replacePageImage(doc.value, pageId, file);
    });
  }

  return {
    busy,
    message,
    cropping,
    cropPanelId,
    copyToPage,
    startCrop,
    cancelCrop,
    applyCrop,
    replaceImage,
  };
}

export type EditingStore = ReturnType<typeof useEditing>;
