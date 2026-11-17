<script setup lang="ts">
import { ref, computed } from "vue";
import {
  Bookmark,
  FolderOpen,
  Plus,
  Crosshair,
  AlertTriangle,
  CheckCircle2,
  Download,
  Trash2,
  ImageOff,
  HardDrive,
  Pencil,
} from "lucide-vue-next";
import type {
  Favorite,
  FavoriteCollection,
  FavoriteSettings,
} from "../../../shared/favorites";
import { STALE_REASON_LABEL } from "../lib/reconcile";

const props = defineProps<{
  collections: FavoriteCollection[];
  favorites: Favorite[];
  activeCollectionId: string;
  settings: FavoriteSettings;
  evidenceUsed: number;
  quotaPercent: number;
  reconciling: boolean;
  previewFavoriteId: string;
  relocatingId: string;
}>();
const emit = defineEmits<{
  selectCollection: [id: string];
  addCollection: [name: string];
  renameCollection: [id: string, name: string];
  requestExportCollection: [id: string];
  requestDeleteCollection: [id: string];
  open: [favorite: Favorite];
  relocate: [favorite: Favorite];
  remove: [id: string];
  clearEvidence: [id: string];
  renameFavorite: [id: string, label: string];
  updateSettings: [patch: Partial<FavoriteSettings>];
}>();

const newCollectionName = ref("");
const editingCollectionId = ref("");
const collectionDraft = ref("");
const editingFavoriteId = ref("");
const favoriteDraft = ref("");

const activeCollection = computed(
  () => props.collections.find((c) => c.id === props.activeCollectionId) ?? null,
);
const visibleFavorites = computed(() =>
  props.favorites.filter((f) => f.collectionId === props.activeCollectionId),
);
const staleInCollection = computed(
  () => visibleFavorites.value.filter((f) => f.status === "stale").length,
);

function addCollection() {
  const name = newCollectionName.value.trim();
  if (!name) return;
  emit("addCollection", name);
  newCollectionName.value = "";
}
function beginRenameCollection(c: FavoriteCollection) {
  editingCollectionId.value = c.id;
  collectionDraft.value = c.name;
}
function saveRenameCollection() {
  if (collectionDraft.value.trim())
    emit("renameCollection", editingCollectionId.value, collectionDraft.value);
  editingCollectionId.value = "";
}
function beginRenameFavorite(f: Favorite) {
  editingFavoriteId.value = f.id;
  favoriteDraft.value = f.label;
}
function saveRenameFavorite() {
  if (favoriteDraft.value.trim())
    emit("renameFavorite", editingFavoriteId.value, favoriteDraft.value);
  editingFavoriteId.value = "";
}
function mb(bytes: number) {
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
function onQuotaInput(e: Event) {
  const valueMb = Number((e.target as HTMLInputElement).value);
  if (Number.isFinite(valueMb) && valueMb > 0)
    emit("updateSettings", { evidenceQuota: Math.round(valueMb * 1024 * 1024) });
}
</script>
<template>
  <section class="favorites-panel">
    <div class="section-heading">
      <span><Bookmark :size="14" /> 细节收藏集</span>
      <span v-if="reconciling" class="muted">核对中…</span>
    </div>

    <div class="collection-tabs">
      <button
        v-for="c in collections"
        :key="c.id"
        class="collection-tab"
        :class="{ active: c.id === activeCollectionId }"
        @click="emit('selectCollection', c.id)"
      >
        <FolderOpen :size="12" />
        <span>{{ c.name }}</span>
        <small>{{ favorites.filter((f) => f.collectionId === c.id).length }}</small>
      </button>
    </div>
    <div class="new-collection">
      <input
        v-model="newCollectionName"
        maxlength="40"
        placeholder="新建收藏集名称"
        @keydown.enter="addCollection"
      />
      <button title="新建收藏集" :disabled="!newCollectionName.trim()" @click="addCollection">
        <Plus :size="14" />
      </button>
    </div>

    <div v-if="activeCollection" class="collection-toolbar">
      <template v-if="editingCollectionId === activeCollection.id">
        <input
          v-model="collectionDraft"
          maxlength="40"
          @keydown.enter="saveRenameCollection"
          @blur="saveRenameCollection"
        />
      </template>
      <template v-else>
        <strong>{{ activeCollection.name }}</strong>
        <button title="重命名收藏集" @click="beginRenameCollection(activeCollection)">
          <Pencil :size="11" />
        </button>
        <span class="toolbar-spacer"></span>
        <button
          title="导出此收藏集记录"
          @click="emit('requestExportCollection', activeCollection.id)"
        >
          <Download :size="12" /> 导出
        </button>
        <button
          class="danger-text"
          title="删除收藏集（建议先导出）"
          @click="emit('requestDeleteCollection', activeCollection.id)"
        >
          <Trash2 :size="12" />
        </button>
      </template>
    </div>
    <p v-if="staleInCollection" class="stale-summary">
      <AlertTriangle :size="12" /> 本集 {{ staleInCollection }} 条需重新定位
    </p>

    <div v-if="!visibleFavorites.length" class="empty-favorites">
      <Crosshair :size="22" />
      <p>在阅读区框选细节，命名后收藏到这里</p>
    </div>

    <article
      v-for="f in visibleFavorites"
      :key="f.id"
      class="favorite-card"
      :class="{
        stale: f.status === 'stale',
        previewing: f.id === previewFavoriteId,
      }"
    >
      <div class="favorite-thumb">
        <img v-if="f.evidence" :src="f.evidence" :alt="`${f.label} 证据缩略图`" />
        <div v-else class="no-evidence"><ImageOff :size="15" /></div>
        <span class="status-badge" :class="f.status">
          <CheckCircle2 v-if="f.status === 'accurate'" :size="10" />
          <AlertTriangle v-else :size="10" />
          {{ f.status === "accurate" ? "准确" : "待重定位" }}
        </span>
      </div>
      <div class="favorite-body">
        <template v-if="editingFavoriteId === f.id">
          <input
            v-model="favoriteDraft"
            maxlength="40"
            @keydown.enter="saveRenameFavorite"
            @blur="saveRenameFavorite"
          />
        </template>
        <template v-else>
          <button class="favorite-name" @click="emit('open', f)">
            {{ f.label }}
          </button>
        </template>
        <p v-if="f.note" class="favorite-note">{{ f.note }}</p>
        <p v-if="f.status === 'stale' && f.staleReason" class="stale-reason">
          {{ STALE_REASON_LABEL[f.staleReason] }}
        </p>
        <div class="favorite-actions">
          <button
            v-if="f.status === 'stale'"
            class="action-relocate"
            :disabled="relocatingId === f.id"
            @click="emit('relocate', f)"
          >
            <Crosshair :size="11" />
            {{ relocatingId === f.id ? "请在画面框选新区域" : "重新定位" }}
          </button>
          <button
            v-else
            class="action-link"
            @click="emit('open', f)"
          >
            放大查看
          </button>
          <span class="toolbar-spacer"></span>
          <button title="重命名" @click="beginRenameFavorite(f)">
            <Pencil :size="11" />
          </button>
          <button
            v-if="f.evidence"
            title="清除证据缩略图"
            @click="emit('clearEvidence', f.id)"
          >
            <ImageOff :size="11" />
          </button>
          <button title="删除收藏" @click="emit('remove', f.id)">
            <Trash2 :size="11" />
          </button>
        </div>
      </div>
    </article>

    <div class="evidence-settings">
      <div class="settings-heading">
        <HardDrive :size="13" /> 证据缩略图
      </div>
      <label class="switch-row">
        <span>保留收藏时的画面证据</span>
        <button
          type="button"
          class="toggle"
          :class="{ on: settings.keepEvidence }"
          :aria-pressed="settings.keepEvidence"
          @click="emit('updateSettings', { keepEvidence: !settings.keepEvidence })"
        >
          <i></i>
        </button>
      </label>
      <label class="quota-row">
        <span>容量上限</span>
        <input
          type="number"
          min="0.25"
          max="20"
          step="0.25"
          :value="Math.round(settings.evidenceQuota / (1024 * 1024) * 4) / 4"
          @input="onQuotaInput"
        />
        <small>MB</small>
      </label>
      <div class="quota-track">
        <i :style="{ width: `${quotaPercent}%` }" :class="{ over: quotaPercent >= 100 }"></i>
      </div>
      <p class="quota-used">
        已用 {{ mb(evidenceUsed) }} / {{ mb(settings.evidenceQuota) }}
      </p>
    </div>
  </section>
</template>
