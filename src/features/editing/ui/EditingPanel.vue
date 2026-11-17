<script setup lang="ts">
import { ref, computed } from "vue";
import { Copy, Scissors, ImagePlus, AlertTriangle } from "lucide-vue-next";
import type { Chapter, ComicPage } from "../../../shared/document";

const props = defineProps<{
  chapters: Chapter[];
  page: ComicPage;
  panelId: string;
  busy: boolean;
  message: string;
  reconciling: boolean;
  staleCount: number;
}>();
const emit = defineEmits<{
  copy: [targetChapterId: string, targetPageId: string];
  crop: [rect: { x: number; y: number; width: number; height: number }];
  replace: [file: File];
}>();

const targetChapterId = ref("");
const targetPageId = ref("");
const targetChapter = computed(
  () => props.chapters.find((c) => c.id === targetChapterId.value) ?? null,
);
const targetPages = computed(() => targetChapter.value?.pages ?? []);

const crop = ref({ x: 0, y: 0, width: 0, height: 0 });
const cropSynced = ref(false);
function syncCrop() {
  const panel = props.page.panels.find((p) => p.id === props.panelId);
  if (panel) {
    crop.value = { ...panel.rect };
    cropSynced.value = true;
  }
}
function submitCrop() {
  emit("crop", { ...crop.value });
  cropSynced.value = false;
}
function onFile(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  if (file) emit("replace", file);
  input.value = "";
}
const currentPanel = computed(
  () => props.page.panels.find((p) => p.id === props.panelId) ?? null,
);
</script>
<template>
  <section class="editing-panel">
    <div class="section-heading">
      <span><Scissors :size="14" /> 画面编辑</span>
      <span v-if="reconciling" class="muted">核对收藏中…</span>
    </div>
    <div v-if="staleCount > 0" class="stale-alert" role="status">
      <AlertTriangle :size="13" />
      {{ staleCount }} 条收藏的旧坐标已失效，请到右侧收藏面板重新定位
    </div>

    <div class="edit-block">
      <h4><Copy :size="12" /> 跨页复制当前分镜</h4>
      <div class="edit-grid">
        <select
          :value="targetChapterId"
          @change="
            targetChapterId = ($event.target as HTMLSelectElement).value;
            targetPageId = '';
          "
        >
          <option value="" disabled>选择章节</option>
          <option v-for="c in chapters" :key="c.id" :value="c.id">
            {{ c.title }}
          </option>
        </select>
        <select
          :value="targetPageId"
          :disabled="!targetChapter"
          @change="targetPageId = ($event.target as HTMLSelectElement).value"
        >
          <option value="" disabled>选择目标页</option>
          <option v-for="p in targetPages" :key="p.id" :value="p.id">
            {{ p.title }}
          </option>
        </select>
      </div>
      <button
        class="edit-action"
        :disabled="busy || !targetChapterId || !targetPageId"
        @click="emit('copy', targetChapterId, targetPageId)"
      >
        复制到该页
      </button>
    </div>

    <div class="edit-block">
      <h4><Scissors :size="12" /> 裁切当前分镜</h4>
      <p class="muted edit-hint">
        当前格：{{ currentPanel?.dialogue.slice(0, 16) ?? "—" }}
      </p>
      <button v-if="!cropSynced" class="edit-action ghost" @click="syncCrop">
        载入当前坐标
      </button>
      <div v-else class="crop-form">
        <label
          >X<input
            v-model.number="crop.x"
            type="number"
            min="0"
            :max="page.width"
        /></label>
        <label
          >Y<input
            v-model.number="crop.y"
            type="number"
            min="0"
            :max="page.height"
        /></label>
        <label
          >宽<input
            v-model.number="crop.width"
            type="number"
            min="40"
            :max="page.width"
        /></label>
        <label
          >高<input
            v-model.number="crop.height"
            type="number"
            min="40"
            :max="page.height"
        /></label>
        <div class="crop-actions">
          <button class="edit-action" :disabled="busy" @click="submitCrop">
            应用裁切
          </button>
          <button class="edit-action ghost" @click="cropSynced = false">
            取消
          </button>
        </div>
      </div>
    </div>

    <div class="edit-block">
      <h4><ImagePlus :size="12" /> 替换本页图片</h4>
      <p class="muted edit-hint">
        替换后图像指纹变化，相关收藏会标记为需重定位，不会套用旧坐标
      </p>
      <label class="replace-button">
        <ImagePlus :size="14" /> 选择新图片
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          :disabled="busy"
          @change="onFile"
      /></label>
    </div>
    <p v-if="message" class="edit-message" role="status">{{ message }}</p>
  </section>
</template>
