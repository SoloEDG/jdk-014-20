import { ref, computed, type Ref } from "vue";
import type {
  ComicDocument,
  ReadingLocation,
  ReadingMode,
} from "../../../shared/document";
import type { RegionRect } from "../../../shared/favorites";
import type { ReaderCommand } from "../../../shared/commands";
import { firstLocation, resolveLocation } from "../../../shared/lookup";
import { normalize, advance } from "../lib/navigation";
import { constrainPan } from "../lib/viewport";

export interface PreviewState {
  favoriteId: string;
  region: RegionRect;
  /** 进入预览前的正式续读点，退出预览时回到这里 */
  resume: ReadingLocation;
  resumeMode: ReadingMode;
}

export function useReader(doc: Ref<ComicDocument>) {
  const location = ref<ReadingLocation>(firstLocation(doc.value)),
    mode = ref<ReadingMode>("page");
  /** 框选模式：在当前格上圈细节 */
  const selecting = ref(false);
  /** 预览模式：从收藏跳入，带显式聚焦区域 */
  const preview = ref<PreviewState | null>(null);
  const current = computed(() => resolveLocation(doc.value, location.value));
  /** 进度/续读点应绑定的位置：预览期间保持为进入前的位置，不被预览污染 */
  const progressLocation = computed(() =>
    preview.value ? preview.value.resume : location.value,
  );
  const focusRegion = computed<RegionRect | null>(
    () => preview.value?.region ?? null,
  );
  const isPreview = computed(() => preview.value !== null);

  function exitPreview() {
    if (!preview.value) return;
    location.value = normalize(doc.value, { ...preview.value.resume });
    mode.value = preview.value.resumeMode;
    preview.value = null;
  }

  function dispatch(command: ReaderCommand) {
    if (command.type === "exit-preview") {
      exitPreview();
      return;
    }
    // 预览期间的翻页/切章/跳转都意味着离开预览，先回到正式续读点
    if (preview.value) exitPreview();
    let at = { ...location.value };
    if (command.type === "move")
      at = advance(doc.value, at, command.delta, mode.value);
    if (command.type === "chapter") {
      const c = doc.value.chapters.find((c) => c.id === command.id);
      at = {
        chapterId: c?.id ?? "",
        pageId: c?.pages[0]?.id ?? "",
        panelId: c?.pages[0]?.panels[0]?.id ?? "",
        zoom: 1,
        x: 0,
        y: 0,
      };
    }
    if (command.type === "panel") {
      at.panelId = command.id;
      at.zoom = 1;
      at.x = at.y = 0;
    }
    if (command.type === "restore") at = { ...command.location };
    location.value = normalize(doc.value, at);
  }

  /** 带收藏 id 的区域聚焦，预览面板据此高亮当前收藏 */
  function openFavorite(
    favoriteId: string,
    target: ReadingLocation,
    region: RegionRect,
  ) {
    const resume = preview.value?.resume ?? { ...location.value };
    const resumeMode = preview.value?.resumeMode ?? mode.value;
    location.value = normalize(doc.value, { ...target, zoom: 1, x: 0, y: 0 });
    mode.value = "panel";
    preview.value = { favoriteId, region, resume, resumeMode };
  }

  function reconcile() {
    location.value = normalize(doc.value, location.value);
  }
  function zoom(delta: number) {
    location.value.zoom = Math.max(
      1,
      Math.min(3, Math.round((location.value.zoom + delta) * 10) / 10),
    );
    Object.assign(
      location.value,
      constrainPan(location.value.x, location.value.y, location.value.zoom),
    );
  }
  function pan(x: number, y: number) {
    Object.assign(location.value, constrainPan(x, y, location.value.zoom));
  }
  function setMode(value: ReadingMode) {
    mode.value = value;
    if (value !== "panel") selecting.value = false;
  }
  function startSelecting() {
    mode.value = "panel";
    selecting.value = true;
  }
  function endSelecting() {
    selecting.value = false;
  }
  return {
    location,
    mode,
    selecting,
    preview,
    current,
    progressLocation,
    focusRegion,
    isPreview,
    dispatch,
    openFavorite,
    exitPreview,
    reconcile,
    zoom,
    pan,
    setMode,
    startSelecting,
    endSelecting,
  };
}
