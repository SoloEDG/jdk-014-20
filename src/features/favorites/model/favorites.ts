import { ref, computed, watch, type Ref } from "vue";
import type {
  ComicDocument,
  Panel,
  ReadingLocation,
} from "../../../shared/document";
import {
  DEFAULT_SETTINGS,
  type EvictionImpact,
  type Favorite,
  type FavoriteCollection,
  type FavoriteSettings,
  type RegionRect,
  estimateBytes,
} from "../../../shared/favorites";
import { makeId } from "../../../shared/commands";
import { writeSession, type SavedSessionV2 } from "../lib/storage";
import {
  captureEvidence,
  planQuota,
  totalEvidenceBytes,
  type QuotaPlan,
} from "../lib/evidence";
import { reconcileFavorites } from "../lib/reconcile";
import { panelFingerprint } from "../lib/hash";

export interface NewFavoriteDraft {
  label: string;
  note: string;
  collectionId: string;
  region: RegionRect;
  location: ReadingLocation;
  panel: Panel;
  imageHash: string;
  page: Parameters<typeof captureEvidence>[0];
  panelRect: Parameters<typeof captureEvidence>[1];
}

interface PendingCommit {
  draft: NewFavoriteDraft;
  evidence: string | null;
  /** 重定位场景下，待更新的收藏 id；为空表示新建 */
  relocateId: string | null;
}

function toQuotaItem(
  favorite: Favorite,
  collectionName: string,
): Parameters<typeof planQuota>[0][number] {
  return {
    id: favorite.id,
    label: favorite.label,
    collectionName,
    evidence: favorite.evidence,
    updated: favorite.updated,
  };
}

export function useFavorites(
  doc: Ref<ComicDocument>,
  location: Ref<ReadingLocation>,
  saved: SavedSessionV2 | null,
) {
  const collections = ref<FavoriteCollection[]>(
    saved?.collections ?? [
      { id: makeId("collection"), name: "默认收藏集", created: Date.now() },
    ],
  );
  const favorites = ref<Favorite[]>(saved?.favorites ?? []);
  const settings = ref<FavoriteSettings>(
    saved?.settings ?? { ...DEFAULT_SETTINGS },
  );
  const status = ref("本地自动保存已开启");
  const activeCollectionId = ref(collections.value[0]?.id ?? "");
  const reconciling = ref(false);
  const lastSummary = ref<{ accurate: number; stale: number } | null>(null);
  /** 容量清理影响预览，由 UI 弹窗确认后才真正清理 */
  const quotaPlan = ref<QuotaPlan | null>(null);
  const pendingDraft = ref<NewFavoriteDraft | null>(null);
  let pendingCommit: PendingCommit | null = null;

  const collectionName = (id: string) =>
    collections.value.find((c) => c.id === id)?.name ?? "未分组";

  const staleCount = computed(
    () => favorites.value.filter((f) => f.status === "stale").length,
  );
  const evidenceUsed = computed(() => totalEvidenceBytes(favorites.value));
  const quotaPercent = computed(() =>
    Math.min(
      100,
      Math.round(
        (evidenceUsed.value / Math.max(1, settings.value.evidenceQuota)) * 100,
      ),
    ),
  );

  function save() {
    status.value = writeSession({
      document: doc.value,
      location: location.value,
      collections: collections.value,
      favorites: favorites.value,
      settings: settings.value,
    });
  }
  watch([doc, location, collections, favorites, settings], save, {
    deep: true,
  });

  // ---------- 收藏集 ----------
  function addCollection(name: string): string | null {
    const trimmed = name.trim();
    if (!trimmed || trimmed.length > 40) return null;
    const collection: FavoriteCollection = {
      id: makeId("collection"),
      name: trimmed,
      created: Date.now(),
    };
    collections.value.push(collection);
    return collection.id;
  }
  function renameCollection(id: string, name: string): boolean {
    const collection = collections.value.find((c) => c.id === id);
    const trimmed = name.trim();
    if (!collection || !trimmed || trimmed.length > 40) return false;
    collection.name = trimmed;
    return true;
  }
  function favoritesOfCollection(id: string) {
    return favorites.value.filter((f) => f.collectionId === id);
  }
  function deleteCollection(id: string) {
    favorites.value = favorites.value.filter((f) => f.collectionId !== id);
    collections.value = collections.value.filter((c) => c.id !== id);
    if (activeCollectionId.value === id)
      activeCollectionId.value = collections.value[0]?.id ?? "";
  }

  // ---------- 新建收藏 ----------
  function beginCreate(draft: NewFavoriteDraft) {
    pendingDraft.value = draft;
  }
  function cancelCreate() {
    pendingDraft.value = null;
    pendingCommit = null;
  }

  /** 容量超额时挂起，等待用户在弹窗确认清理影响 */
  function suspendForQuota(
    plan: QuotaPlan,
    draft: NewFavoriteDraft,
    evidence: string | null,
    relocateId: string | null,
  ) {
    quotaPlan.value = plan;
    pendingCommit = { draft, evidence, relocateId };
    pendingDraft.value = draft;
  }

  async function commitCreate(): Promise<{ ok: boolean; message: string }> {
    const draft = pendingDraft.value;
    if (!draft) return { ok: false, message: "没有待保存的选区" };
    const evidence = settings.value.keepEvidence
      ? await captureEvidence(draft.page, draft.panelRect, draft.region)
      : null;
    const plan = planQuota(
      favorites.value.map((f) => toQuotaItem(f, collectionName(f.collectionId))),
      evidence
        ? {
            id: "pending",
            label: draft.label.trim() || "未命名细节",
            collectionName: collectionName(draft.collectionId),
            evidence,
            updated: Date.now(),
          }
        : null,
      settings.value.evidenceQuota,
    );
    if (plan.overflow) {
      suspendForQuota(plan, draft, evidence, null);
      return { ok: false, message: "证据容量将超额，请先确认清理影响" };
    }
    favorites.value.push({
      id: makeId("favorite"),
      label: draft.label.trim() || "未命名细节",
      note: draft.note.trim(),
      collectionId: draft.collectionId,
      location: { ...draft.location },
      region: draft.region,
      status: "accurate",
      staleReason: null,
      panelFingerprint: panelFingerprint(draft.panel),
      imageHash: draft.imageHash,
      evidence,
      created: Date.now(),
      updated: Date.now(),
    });
    pendingDraft.value = null;
    return { ok: true, message: "已加入收藏集" };
  }

  /** 弹窗确认：按预览清单清理旧证据，再完成挂起的新建/重定位 */
  function confirmEviction() {
    const commit = pendingCommit;
    const plan = quotaPlan.value;
    if (!commit || !plan) return;
    const removeIds = new Set(plan.evictions.map((e) => e.favoriteId));
    for (const favorite of favorites.value)
      if (removeIds.has(favorite.id)) favorite.evidence = null;
    if (commit.relocateId) {
      const favorite = favorites.value.find((f) => f.id === commit.relocateId);
      if (favorite) {
        favorite.region = commit.draft.region;
        favorite.location = { ...commit.draft.location };
        favorite.panelFingerprint = panelFingerprint(commit.draft.panel);
        favorite.imageHash = commit.draft.imageHash;
        favorite.status = "accurate";
        favorite.staleReason = null;
        favorite.evidence = commit.evidence;
        favorite.updated = Date.now();
      }
    } else {
      favorites.value.push({
        id: makeId("favorite"),
        label: commit.draft.label.trim() || "未命名细节",
        note: commit.draft.note.trim(),
        collectionId: commit.draft.collectionId,
        location: { ...commit.draft.location },
        region: commit.draft.region,
        status: "accurate",
        staleReason: null,
        panelFingerprint: panelFingerprint(commit.draft.panel),
        imageHash: commit.draft.imageHash,
        evidence: commit.evidence,
        created: Date.now(),
        updated: Date.now(),
      });
    }
    quotaPlan.value = null;
    pendingCommit = null;
    pendingDraft.value = null;
  }
  function cancelEviction() {
    quotaPlan.value = null;
    pendingCommit = null;
  }

  /** 容量弹窗统一确认：挂起的新建/重定位走提交逻辑，设置降额走直接清理 */
  function confirmQuota() {
    if (pendingCommit) confirmEviction();
    else applySettingsEviction();
  }
  function cancelQuota() {
    quotaPlan.value = null;
    pendingCommit = null;
  }

  function removeFavorite(id: string) {
    favorites.value = favorites.value.filter((f) => f.id !== id);
  }
  function renameFavorite(id: string, label: string): boolean {
    const favorite = favorites.value.find((f) => f.id === id);
    const trimmed = label.trim();
    if (!favorite || !trimmed || trimmed.length > 40) return false;
    favorite.label = trimmed;
    favorite.updated = Date.now();
    return true;
  }
  function moveFavorite(id: string, collectionId: string) {
    const favorite = favorites.value.find((f) => f.id === id);
    if (favorite && collections.value.some((c) => c.id === collectionId)) {
      favorite.collectionId = collectionId;
      favorite.updated = Date.now();
    }
  }

  /**
   * 重定位：只更新这一条收藏的坐标、指纹与证据，
   * 同集合其他收藏的 region 完全不动。
   */
  async function relocate(
    id: string,
    region: RegionRect,
    locationValue: ReadingLocation,
    panel: Panel,
    page: Parameters<typeof captureEvidence>[0],
    imageHash: string,
  ): Promise<string> {
    const favorite = favorites.value.find((f) => f.id === id);
    if (!favorite) return "收藏不存在";
    const draft: NewFavoriteDraft = {
      label: favorite.label,
      note: favorite.note,
      collectionId: favorite.collectionId,
      region,
      location: locationValue,
      panel,
      imageHash,
      page,
      panelRect: panel.rect,
    };
    const evidence = settings.value.keepEvidence
      ? await captureEvidence(page, panel.rect, region)
      : null;
    const plan = planQuota(
      favorites.value
        .filter((f) => f.id !== id)
        .map((f) => toQuotaItem(f, collectionName(f.collectionId))),
      evidence
        ? {
            id,
            label: favorite.label,
            collectionName: collectionName(favorite.collectionId),
            evidence,
            updated: Date.now(),
          }
        : null,
      settings.value.evidenceQuota,
    );
    if (plan.overflow) {
      suspendForQuota(plan, draft, evidence, id);
      return "证据容量将超额，请确认清理影响";
    }
    favorite.region = region;
    favorite.location = { ...locationValue };
    favorite.panelFingerprint = panelFingerprint(panel);
    favorite.imageHash = imageHash;
    favorite.status = "accurate";
    favorite.staleReason = null;
    favorite.evidence = evidence;
    favorite.updated = Date.now();
    return "已重新定位";
  }

  /** 手动丢掉某条证据（坐标与收藏本身保留） */
  function clearEvidence(id: string) {
    const favorite = favorites.value.find((f) => f.id === id);
    if (favorite) favorite.evidence = null;
  }

  /** 更新设置：关闭保留证据时清空全部缩略图；调低上限超额时给清理预览 */
  function updateSettings(patch: Partial<FavoriteSettings>): QuotaPlan | null {
    const next = { ...settings.value, ...patch };
    next.evidenceQuota = Math.max(
      256 * 1024,
      Math.min(20 * 1024 * 1024, Math.round(next.evidenceQuota)),
    );
    if (patch.keepEvidence === false)
      for (const favorite of favorites.value) favorite.evidence = null;
    settings.value = next;
    const used = totalEvidenceBytes(favorites.value);
    if (used > next.evidenceQuota) {
      const plan = planQuota(
        favorites.value.map((f) =>
          toQuotaItem(f, collectionName(f.collectionId)),
        ),
        null,
        next.evidenceQuota,
      );
      quotaPlan.value = plan;
      pendingCommit = null;
      return plan;
    }
    return null;
  }
  function applySettingsEviction() {
    const plan = quotaPlan.value;
    if (!plan) return;
    const removeIds = new Set(plan.evictions.map((e) => e.favoriteId));
    for (const favorite of favorites.value)
      if (removeIds.has(favorite.id)) favorite.evidence = null;
    quotaPlan.value = null;
  }

  /** 编辑（复制/裁切/替换/删章）后核对：只改状态，不动坐标 */
  async function reconcile(): Promise<{ accurate: number; stale: number }> {
    reconciling.value = true;
    try {
      const result = await reconcileFavorites(doc.value, favorites.value);
      favorites.value = result.favorites;
      lastSummary.value = {
        accurate: result.summary.accurate,
        stale: result.summary.stale,
      };
      return lastSummary.value;
    } finally {
      reconciling.value = false;
    }
  }

  return {
    collections,
    favorites,
    settings,
    status,
    activeCollectionId,
    reconciling,
    lastSummary,
    quotaPlan,
    pendingDraft,
    staleCount,
    evidenceUsed,
    quotaPercent,
    collectionName,
    favoritesOfCollection,
    addCollection,
    renameCollection,
    deleteCollection,
    beginCreate,
    cancelCreate,
    commitCreate,
    confirmEviction,
    cancelEviction,
    confirmQuota,
    cancelQuota,
    removeFavorite,
    renameFavorite,
    moveFavorite,
    relocate,
    clearEvidence,
    updateSettings,
    applySettingsEviction,
    reconcile,
    save,
  };
}

export type FavoritesStore = ReturnType<typeof useFavorites>;
export type { EvictionImpact };
export { estimateBytes };
