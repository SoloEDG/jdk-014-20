<script setup lang="ts">
import { computed } from "vue";
import {
  BookOpen,
  ChevronRight,
  Grid2X2,
  Scan,
  Minus,
  Plus,
  Crosshair,
  Cloud,
  PanelLeftClose,
} from "lucide-vue-next";
import { LibraryPanel } from "../features/library";
import { ChapterPanel } from "../features/chapters";
import { ReaderStage, PanelStrip } from "../features/reader";
import { AudioPanel } from "../features/audio";
import { ProgressPanel } from "../features/progress";
import { FavoritePanel, FavoriteDialog, QuotaDialog } from "../features/favorites";
import { EditingPanel } from "../features/editing";
import { useWorkspace } from "./workspace";

const w = useWorkspace();
const { doc, reader: r, progress: p, library: l, chapters: c, audio: a } = w;
const { favorites: f, editing: e } = w;
const current = r.current,
  at = r.location,
  mode = r.mode,
  metrics = p.metrics,
  cue = a.cue;
const chapterIndex = computed(
  () => doc.value.chapters.findIndex((ch) => ch.id === at.value.chapterId) + 1,
);
function focus(id: string) {
  r.dispatch({ type: "panel", id });
  r.setMode("panel");
}
</script>
<template>
  <div class="app-shell">
    <header class="app-header">
      <a class="brand" href="./"
        ><div class="brand-icon"><BookOpen :size="22" /></div>
        <strong>PANEL<span>沉浸漫画</span></strong></a
      >
      <nav>
        <span>我的书架</span><ChevronRight :size="13" /><strong>{{
          doc.title
        }}</strong
        ><span class="preview-tag">正在阅读</span>
      </nav>
      <div class="header-right">
        <Cloud :size="15" /><span>本地已就绪</span>
        <div class="avatar">林</div>
      </div>
    </header>
    <div class="workspace">
      <aside class="left-sidebar">
        <div class="book-cover">
          <img :src="doc.chapters[0]?.pages[0]?.image" alt="雨停之前漫画封面" />
          <div>
            <small>ORIGINAL COMIC</small>
            <h1>{{ doc.title }}</h1>
            <p>{{ doc.author }} 著</p>
          </div>
          <span>全彩 · 沉浸版</span>
        </div>
        <div class="book-details">
          <h2>{{ doc.title }} <span>连载中</span></h2>
          <p>当城市沉睡，故事才刚刚开始。</p>
          <div><span>都市悬疑</span><span>氛围叙事</span></div>
        </div>
        <ChapterPanel
          :chapters="doc.chapters"
          :active="at.chapterId"
          :editing="c.editing.value"
          :draft="c.draft.value"
          :error="c.error.value"
          @select="r.dispatch({ type: 'chapter', id: $event })"
          @rename="c.begin"
          @move="c.move"
          @remove="c.remove"
          @draft="c.draft.value = $event"
          @save="c.rename"
        /><LibraryPanel
          :busy="l.busy.value"
          :message="l.message.value"
          @import="l.importFiles"
          @reset="l.reset"
        />
        <div class="sidebar-footer">
          <PanelLeftClose :size="14" /> 你的私人漫画放映室 <span>v2.0</span>
        </div>
      </aside>
      <main class="reading-workspace">
        <div class="reader-toolbar">
          <div>
            <span class="chapter-eyebrow"
              >CHAPTER {{ String(chapterIndex).padStart(2, "0") }}</span
            >
            <h2>{{ current.chapter?.title }}</h2>
          </div>
          <div class="reader-tools">
            <div class="mode-switch">
              <button
                :class="{ active: mode === 'page' }"
                @click="r.setMode('page')"
              >
                <Grid2X2 :size="14" /> 整页</button
              ><button
                :class="{ active: mode === 'panel' }"
                @click="r.setMode('panel')"
              >
                <Scan :size="14" /> 逐格
              </button>
            </div>
            <span class="tool-divider"></span
            ><button aria-label="缩小" @click="r.zoom(-0.2)">
              <Minus :size="15" /></button
            ><span class="zoom-value">{{ Math.round(at.zoom * 100) }}%</span
            ><button aria-label="放大" @click="r.zoom(0.2)">
              <Plus :size="15" /></button
            ><button
              class="select-button"
              :class="{ active: r.selecting.value }"
              title="框选细节并收藏 (S)"
              @click="r.selecting.value ? r.endSelecting() : r.startSelecting()"
            >
              <Crosshair :size="16" /> 框选收藏
            </button>
          </div>
        </div>
        <ReaderStage
          v-if="current.page && current.panel"
          :page="current.page"
          :panel="current.panel"
          :location="at"
          :mode="mode"
          :selecting="r.selecting.value"
          :focus-region="r.focusRegion.value"
          :is-preview="r.isPreview.value"
          :preview-label="w.previewLabel.value"
          :stale-region="
            w.relocatingFavorite.value &&
            w.relocatingFavorite.value.location.pageId === current.page.id
              ? w.relocatingFavorite.value.region
              : null
          "
          @move="r.dispatch({ type: 'move', delta: $event })"
          @pan="r.pan"
          @panel="focus"
          @select="w.onStageSelect"
          @cancel-select="r.endSelecting(); w.cancelRelocate()"
          @exit-preview="r.exitPreview()"
        />
        <div class="page-position">
          <span>{{ current.chapter?.subtitle }}</span>
          <div>
            <b>{{ String(metrics.pageIndex).padStart(2, "0") }}</b
            ><span>/ {{ String(metrics.pageCount).padStart(2, "0") }}</span
            ><small>页</small>
          </div>
          <span>阅读位置自动保存 <i></i></span>
        </div>
        <PanelStrip
          v-if="current.page"
          :page="current.page"
          :active="at.panelId"
          @select="focus"
        />
        <EditingPanel
          v-if="current.page"
          :chapters="doc.chapters"
          :page="current.page"
          :panel-id="at.panelId"
          :busy="e.busy.value"
          :message="e.message.value"
          :reconciling="f.reconciling.value"
          :stale-count="f.staleCount.value"
          @copy="w.onCopy"
          @crop="w.onCrop"
          @replace="w.onReplace"
        />
      </main>
      <aside class="right-sidebar">
        <AudioPanel
          :enabled="a.enabled.value"
          :volume="a.volume.value"
          :dialogue="a.dialogue.value"
          :cue="cue"
          :error="a.error.value"
          @toggle="a.toggle"
          @volume="a.volume.value = $event"
          @dialogue="a.dialogue.value = !a.dialogue.value"
        />
        <FavoritePanel
          :collections="f.collections.value"
          :favorites="f.favorites.value"
          :active-collection-id="f.activeCollectionId.value"
          :settings="f.settings.value"
          :evidence-used="f.evidenceUsed.value"
          :quota-percent="f.quotaPercent.value"
          :reconciling="f.reconciling.value"
          :preview-favorite-id="r.preview.value?.favoriteId ?? ''"
          :relocating-id="w.relocatingId.value"
          @select-collection="f.activeCollectionId.value = $event"
          @add-collection="f.addCollection($event)"
          @rename-collection="f.renameCollection($event[0], $event[1])"
          @request-export-collection="w.requestExportCollection"
          @request-delete-collection="w.requestDeleteCollection"
          @open="w.openFavorite"
          @relocate="w.startRelocate"
          @remove="f.removeFavorite"
          @clear-evidence="f.clearEvidence"
          @rename-favorite="f.renameFavorite($event[0], $event[1])"
          @update-settings="f.updateSettings($event)"
        />
        <ProgressPanel :percent="metrics.percent" :status="f.status.value" />
        <div class="reading-tip">
          <span>✦ 收藏小贴士</span>
          <p>框选格内细节并命名，点击收藏即可放大回看；<br />编辑画面后失效收藏会明确标记，等你重新定位。</p>
          <kbd>S</kbd> <small>框选收藏</small><br /><kbd>Esc</kbd>
          <small>退出框选 / 返回续读</small>
        </div>
      </aside>
    </div>
    <FavoriteDialog
      :open="w.dialogOpen.value"
      :collections="f.collections.value"
      :active-collection-id="f.activeCollectionId.value"
      :default-label="w.dialogDefaultLabel.value"
      @save="w.onDialogSave"
      @create-collection="f.addCollection($event)"
      @cancel="f.cancelCreate(); (w.dialogOpen.value = false)"
    />
    <QuotaDialog
      :plan="f.quotaPlan.value"
      @confirm="w.onQuotaConfirm()"
      @cancel="w.onQuotaCancel()"
    />
    <footer class="app-footer">
      <span><i></i> 所有故事，都有回声。</span
      ><span>PANEL · 为每一格想象而生</span
      ><span>图片导入 · 本地存储 · 无需联网</span>
    </footer>
  </div>
</template>
