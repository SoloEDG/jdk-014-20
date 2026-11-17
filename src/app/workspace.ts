import { ref, computed, onMounted, onBeforeUnmount } from "vue";
import { demoDocument, useLibrary } from "../features/library";
import { useChapters } from "../features/chapters";
import { useReader } from "../features/reader";
import { useAudio } from "../features/audio";
import { useProgress } from "../features/progress";
import {
  useFavorites,
  readSession,
  exportCollection,
  type NewFavoriteDraft,
} from "../features/favorites";
import { useEditing } from "../features/editing";
import { hashPage } from "../features/favorites/lib/hash";
import type { Favorite, RegionRect } from "../shared/favorites";

export function useWorkspace() {
  const saved = readSession();
  const doc = ref(saved?.document ?? demoDocument());
  const reader = useReader(doc);
  if (saved) reader.dispatch({ type: "restore", location: saved.location });

  const favorites = useFavorites(doc, reader.progressLocation, saved);
  const progress = useProgress(doc, reader.progressLocation);

  const library = useLibrary(doc, (id) => {
    reader.dispatch({ type: "chapter", id });
    progress.reconcile();
    void favorites.reconcile();
  });

  const editing = useEditing(doc, () => favorites.reconcile());

  const chapters = useChapters(doc, () => {
    reader.reconcile();
    progress.reconcile();
    void favorites.reconcile();
  });

  const panel = computed(() => reader.current.value.panel);
  const audio = useAudio(panel);

  // ---------- 框选 → 新建收藏 ----------
  const dialogOpen = ref(false);
  const draftRegion = ref<RegionRect | null>(null);
  const dialogDefaultLabel = ref("");

  async function onRegionSelected(region: RegionRect) {
    reader.endSelecting();
    draftRegion.value = region;
    const { chapter, page, panel: currentPanel } = reader.current.value;
    if (!page || !currentPanel) return;
    dialogDefaultLabel.value = `${chapter?.title ?? "章节"} · ${page.title} 细节`;
    const imageHash = await hashPage(page);
    const draft: NewFavoriteDraft = {
      label: "",
      note: "",
      collectionId: favorites.activeCollectionId.value ||
        favorites.collections.value[0]?.id ||
        "",
      region,
      location: { ...reader.location.value },
      panel: currentPanel,
      imageHash,
      page,
      panelRect: currentPanel.rect,
    };
    favorites.beginCreate(draft);
    dialogOpen.value = true;
  }

  function onDialogSave(payload: {
    label: string;
    note: string;
    collectionId: string;
  }) {
    const draft = favorites.pendingDraft.value;
    if (!draft) return;
    favorites.beginCreate({
      ...draft,
      label: payload.label,
      note: payload.note,
      collectionId: payload.collectionId,
    });
    void favorites.commitCreate().then((result) => {
      if (result.ok) dialogOpen.value = false;
      else if (result.message.includes("超额")) dialogOpen.value = false;
    });
  }

  // ---------- 打开收藏：准确→区域预览；失效→进入重定位 ----------
  const relocatingId = ref("");
  const relocatingFavorite = ref<Favorite | null>(null);

  function openFavorite(favorite: Favorite) {
    if (favorite.status === "stale") {
      startRelocate(favorite);
      return;
    }
    const pageExists = doc.value.chapters
      .flatMap((c) => c.pages)
      .some((p) => p.id === favorite.location.pageId);
    if (!pageExists) {
      favorites.status.value = "原页面已不存在，请为该收藏重新定位";
      startRelocate(favorite);
      return;
    }
    reader.openFavorite(favorite.id, favorite.location, favorite.region);
  }

  function startRelocate(favorite: Favorite) {
    relocatingId.value = favorite.id;
    relocatingFavorite.value = favorite;
    // 失效分镜可能已不存在：先跳到记录的页（若在），否则留在当前页框选
    const pageExists = doc.value.chapters
      .flatMap((c) => c.pages)
      .some((p) => p.id === favorite.location.pageId);
    if (pageExists)
      reader.dispatch({ type: "restore", location: favorite.location });
    reader.setMode("panel");
    reader.startSelecting();
    favorites.status.value = `请在画面上框选「${favorite.label}」的新位置`;
  }

  async function onRelocateSelected(region: RegionRect) {
    const favorite = relocatingFavorite.value;
    reader.endSelecting();
    if (!favorite) return;
    const { page, panel: currentPanel } = reader.current.value;
    if (!page || !currentPanel) return;
    const imageHash = await hashPage(page);
    const message = await favorites.relocate(
      favorite.id,
      region,
      { ...reader.location.value },
      currentPanel,
      page,
      imageHash,
    );
    favorites.status.value = message;
    if (!message.includes("超额")) {
      relocatingId.value = "";
      relocatingFavorite.value = null;
    }
  }

  function cancelRelocate() {
    reader.endSelecting();
    relocatingId.value = "";
    relocatingFavorite.value = null;
  }

  function onQuotaConfirm() {
    favorites.confirmQuota();
    // 若弹窗来自重定位流程，提交后该收藏已恢复准确，结束重定位态
    if (relocatingFavorite.value) {
      relocatingId.value = "";
      relocatingFavorite.value = null;
    }
  }
  function onQuotaCancel() {
    favorites.cancelQuota();
    // 重定位流程中放弃清理：本次重定位不生效，退出框选态
    if (relocatingFavorite.value) cancelRelocate();
  }

  // ReaderStage 的框选事件按当前模式分流
  function onStageSelect(region: RegionRect) {
    if (relocatingFavorite.value) void onRelocateSelected(region);
    else void onRegionSelected(region);
  }

  // ---------- 收藏集导出 / 删除 ----------
  function requestExportCollection(id: string) {
    const collection = favorites.collections.value.find((c) => c.id === id);
    if (!collection) return;
    const count = exportCollection(
      doc.value,
      collection,
      favorites.favorites.value,
      favorites.settings.value.keepEvidence,
    );
    favorites.status.value = `已导出「${collection.name}」共 ${count} 条记录`;
  }
  function requestDeleteCollection(id: string) {
    const collection = favorites.collections.value.find((c) => c.id === id);
    if (!collection) return;
    const count = favorites.favoritesOfCollection(id).length;
    const ok = window.confirm(
      `确认删除收藏集「${collection.name}」？其中 ${count} 条收藏将一并删除。\n建议先导出留档，点击“确定”立即删除。`,
    );
    if (ok) {
      favorites.deleteCollection(id);
      favorites.status.value = `已删除收藏集「${collection.name}」`;
    }
  }

  // ---------- 编辑事件 ----------
  function onCopy(targetChapterId: string, targetPageId: string) {
    const { page, panel } = reader.current.value;
    if (!page || !panel) return;
    editing.copyToPage(page.id, panel.id, {
      chapterId: targetChapterId,
      pageId: targetPageId,
    });
  }
  function onCrop(rect: { x: number; y: number; width: number; height: number }) {
    const { page, panel } = reader.current.value;
    if (!page || !panel) return;
    editing.applyCrop(page.id, panel.id, rect);
  }
  function onReplace(file: File) {
    const { page } = reader.current.value;
    if (!page) return;
    editing.replaceImage(page.id, file);
  }

  function keydown(e: KeyboardEvent) {
    if ((e.target as HTMLElement)?.closest("input,textarea,button,select"))
      return;
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      reader.dispatch({ type: "move", delta: e.key === "ArrowRight" ? 1 : -1 });
    }
    if (e.key === " ") {
      e.preventDefault();
      audio.toggle();
    }
    if (e.key === "Escape") {
      if (reader.selecting.value) {
        reader.endSelecting();
        cancelRelocate();
      } else if (reader.isPreview.value) reader.exitPreview();
      else reader.setMode("page");
    }
    if (e.key.toLowerCase() === "s" && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      if (!reader.selecting.value) reader.startSelecting();
    }
  }
  onMounted(() => window.addEventListener("keydown", keydown));
  onBeforeUnmount(() => window.removeEventListener("keydown", keydown));

  // 首次加载后对迁移/历史收藏做一次核对（指纹为空会回填，不误报）
  onMounted(() => {
    void favorites.reconcile();
  });

  const previewLabel = computed(() => {
    const id = reader.preview.value?.favoriteId;
    return favorites.favorites.value.find((f) => f.id === id)?.label ?? "";
  });

  return {
    doc,
    reader,
    progress,
    library,
    chapters,
    audio,
    favorites,
    editing,
    dialogOpen,
    dialogDefaultLabel,
    draftRegion,
    relocatingId,
    relocatingFavorite,
    previewLabel,
    onRegionSelected,
    onDialogSave,
    openFavorite,
    startRelocate,
    cancelRelocate,
    onStageSelect,
    onQuotaConfirm,
    onQuotaCancel,
    requestExportCollection,
    requestDeleteCollection,
    onCopy,
    onCrop,
    onReplace,
  };
}
