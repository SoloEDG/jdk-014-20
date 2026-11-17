<script setup lang="ts">
import { ref, watch } from "vue";
import { Bookmark, FolderPlus } from "lucide-vue-next";
import type { FavoriteCollection } from "../../../shared/favorites";

const props = defineProps<{
  open: boolean;
  collections: FavoriteCollection[];
  activeCollectionId: string;
  defaultLabel: string;
}>();
const emit = defineEmits<{
  save: [payload: { label: string; note: string; collectionId: string }];
  createCollection: [name: string];
  cancel: [];
}>();
const label = ref("");
const note = ref("");
const collectionId = ref("");
const newCollection = ref("");
watch(
  () => props.open,
  (open) => {
    if (open) {
      label.value = props.defaultLabel;
      note.value = "";
      collectionId.value = props.activeCollectionId || props.collections[0]?.id || "";
      newCollection.value = "";
    }
  },
);
function submit() {
  emit("save", {
    label: label.value,
    note: note.value,
    collectionId: collectionId.value,
  });
}
function createCollection() {
  const name = newCollection.value.trim();
  if (!name) return;
  emit("createCollection", name);
  newCollection.value = "";
}
</script>
<template>
  <div v-if="open" class="modal-backdrop" @click.self="emit('cancel')">
    <form class="modal-card favorite-dialog" @submit.prevent="submit">
      <div class="modal-heading">
        <Bookmark :size="16" /> 收藏画面细节
      </div>
      <label class="field">
        <span>收藏名称</span>
        <input
          v-model="label"
          maxlength="40"
          placeholder="给这个细节起个名字"
          autofocus
        />
      </label>
      <label class="field">
        <span>备注（可选）</span>
        <textarea
          v-model="note"
          rows="2"
          maxlength="120"
          placeholder="记录你在意的细节…"
        ></textarea>
      </label>
      <label class="field">
        <span>归入收藏集</span>
        <select v-model="collectionId">
          <option v-for="c in collections" :key="c.id" :value="c.id">
            {{ c.name }}
          </option>
        </select>
      </label>
      <div class="field inline-field">
        <input
          v-model="newCollection"
          maxlength="40"
          placeholder="或新建收藏集"
          @keydown.enter.prevent="createCollection"
        />
        <button
          type="button"
          class="modal-mini"
          :disabled="!newCollection.trim()"
          @click="createCollection"
        >
          <FolderPlus :size="13" /> 新建
        </button>
      </div>
      <div class="modal-actions">
        <button type="button" class="modal-mini" @click="emit('cancel')">
          取消
        </button>
        <button type="submit" class="modal-primary">保存收藏</button>
      </div>
    </form>
  </div>
</template>
