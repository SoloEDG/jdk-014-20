<script setup lang="ts">
import { ref, computed } from "vue";
import {
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Crosshair,
  Undo2,
} from "lucide-vue-next";
import type {
  ComicPage,
  Panel,
  ReadingLocation,
  ReadingMode,
  Rect,
} from "../../../shared/document";
import type { RegionRect } from "../../../shared/favorites";
import { frameStyle } from "../lib/viewport";
import {
  pageRectFromElement,
  regionFromPageRect,
  regionToPageRect,
  regionOverlayStyle,
} from "../../favorites/lib/region";

const props = defineProps<{
  page: ComicPage;
  panel: Panel;
  location: ReadingLocation;
  mode: ReadingMode;
  selecting: boolean;
  focusRegion: RegionRect | null;
  isPreview: boolean;
  previewLabel?: string;
  /** 重定位时回显的旧区域（虚线） */
  staleRegion?: RegionRect | null;
}>();
const emit = defineEmits<{
  move: [delta: number];
  pan: [x: number, y: number];
  panel: [id: string];
  select: [region: RegionRect];
  cancelSelect: [];
  exitPreview: [];
}>();
const stage = ref<HTMLElement>();
const imageEl = ref<HTMLElement>();
let drag: { x: number; y: number; px: number; py: number } | null = null;
let drawing: { startX: number; startY: number } | null = null;
const draftRect = ref<Rect | null>(null);

const frame = computed(() =>
  frameStyle(props.page, props.panel, {
    mode: props.mode,
    panel: props.panel,
    focusRegion: props.focusRegion,
  }),
);
const focusRect = computed(() =>
  props.focusRegion
    ? regionToPageRect(props.focusRegion, props.panel.rect)
    : null,
);
const staleRect = computed(() =>
  props.staleRegion ? regionToPageRect(props.staleRegion, props.panel.rect) : null,
);

function down(e: PointerEvent) {
  if (props.selecting && imageEl.value) {
    drawing = { startX: e.clientX, startY: e.clientY };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    draftRect.value = null;
    return;
  }
  if (props.location.zoom <= 1) return;
  drag = {
    x: e.clientX,
    y: e.clientY,
    px: props.location.x,
    py: props.location.y,
  };
  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
}
function move(e: PointerEvent) {
  if (drawing && imageEl.value) {
    draftRect.value = pageRectFromElement(
      imageEl.value,
      drawing.startX,
      drawing.startY,
      e.clientX,
      e.clientY,
      props.page.width,
      props.page.height,
    );
    return;
  }
  if (drag)
    emit("pan", drag.px + e.clientX - drag.x, drag.py + e.clientY - drag.y);
}
function up() {
  if (drawing && draftRect.value) {
    const region = regionFromPageRect(draftRect.value, props.panel.rect);
    if (region) emit("select", region);
    draftRect.value = null;
    drawing = null;
    return;
  }
  drawing = null;
  drag = null;
}
function fullscreen() {
  if (document.fullscreenElement) void document.exitFullscreen();
  else void stage.value?.requestFullscreen();
}
</script>
<template>
  <section ref="stage" class="reader-stage">
    <div class="stage-grain"></div>
    <div class="stage-topline">
      <span><i></i> IMMERSIVE READING</span>
      <div class="topline-actions">
        <button
          v-if="isPreview"
          class="preview-exit"
          title="返回收藏前的续读点"
          @click="emit('exitPreview')"
        >
          <Undo2 :size="14" /> 返回续读
        </button>
        <button title="全屏阅读" @click="fullscreen">
          <Maximize2 :size="16" />
        </button>
      </div>
    </div>
    <div v-if="isPreview" class="preview-banner">
      <Crosshair :size="13" />
      <span>收藏预览 · {{ previewLabel ?? "细节区域" }}</span>
      <small>声音与对白来自目标格</small>
    </div>
    <div v-if="selecting" class="selecting-banner">
      <Crosshair :size="13" />
      <span>框选要收藏的细节</span>
      <button title="取消框选" @click="emit('cancelSelect')">取消</button>
    </div>
    <button
      class="nav-arrow previous"
      aria-label="上一页或分镜"
      @click="emit('move', -1)"
    >
      <ChevronLeft :size="23" />
    </button>
    <div
      class="comic-frame"
      :class="{ focused: mode === 'panel', selecting }"
      @pointerdown="down"
      @pointermove="move"
      @pointerup="up"
      @pointercancel="up"
    >
      <div
        ref="imageEl"
        class="comic-image"
        :style="{
          ...frame,
          transform: `translate(${location.x}px, ${location.y}px) scale(${location.zoom})`,
        }"
      >
        <template v-if="mode === 'page'">
          <button
            v-for="(p, i) in page.panels"
            :key="p.id"
            class="panel-hotspot"
            :style="{
              left: `${(p.rect.x / page.width) * 100}%`,
              top: `${(p.rect.y / page.height) * 100}%`,
              width: `${(p.rect.width / page.width) * 100}%`,
              height: `${(p.rect.height / page.height) * 100}%`,
            }"
            :aria-label="`阅读分镜 ${i + 1}`"
            @dblclick="emit('panel', p.id)"
          >
            <span>{{ String(i + 1).padStart(2, "0") }}</span>
          </button>
        </template>
        <div
          v-if="staleRect && !focusRect"
          class="region-overlay stale"
          :style="regionOverlayStyle(staleRect, page)"
        ></div>
        <div
          v-if="focusRect"
          class="region-overlay focus"
          :style="regionOverlayStyle(focusRect, page)"
        ></div>
        <div
          v-if="draftRect"
          class="region-overlay draft"
          :style="regionOverlayStyle(draftRect, page)"
        ></div>
      </div>
    </div>
    <button
      class="nav-arrow next"
      aria-label="下一页或分镜"
      @click="emit('move', 1)"
    >
      <ChevronRight :size="23" />
    </button>
    <div class="stage-caption">
      <span
        >{{ selecting ? "区域框选" : mode === "page" ? "整页浏览" : "逐格沉浸" }}
        <b>·</b> {{ page.title }}</span
      ><span v-if="selecting">按住拖出选区 <b>·</b> 松开即收藏</span
      ><span v-else>← → 翻阅 <b>·</b> 双击分镜进入</span>
    </div>
  </section>
</template>
