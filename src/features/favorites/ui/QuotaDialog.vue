<script setup lang="ts">
import { HardDriveDownload, ShieldAlert } from "lucide-vue-next";
import type { QuotaPlan } from "../lib/evidence";

defineProps<{ plan: QuotaPlan | null }>();
const emit = defineEmits<{ confirm: []; cancel: [] }>();

function mb(bytes: number) {
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
</script>
<template>
  <div v-if="plan" class="modal-backdrop" @click.self="emit('cancel')">
    <div class="modal-card quota-dialog">
      <div class="modal-heading warning">
        <ShieldAlert :size="16" /> 证据缩略图将超过容量上限
      </div>
      <p class="quota-line">
        容量上限 <b>{{ mb(plan.quota) }}</b
        >，当前已用 <b>{{ mb(plan.used) }}</b
        >，清理后预计占用
        <b :class="{ over: plan.projectedUsed > plan.quota }">{{
          mb(plan.projectedUsed)
        }}</b>
      </p>
      <p class="quota-sub">
        以下收藏的证据缩略图将被清理（坐标与收藏记录保留，仅移除画面证据），按最久未更新优先：
      </p>
      <ul class="eviction-list">
        <li v-for="item in plan.evictions" :key="item.favoriteId">
          <span class="eviction-thumb"
            ><HardDriveDownload :size="13"
          /></span>
          <div>
            <strong>{{ item.label }}</strong>
            <small>{{ item.collectionName }}</small>
          </div>
          <b class="eviction-bytes">{{ mb(item.bytes) }}</b>
        </li>
      </ul>
      <p v-if="!plan.evictions.length" class="quota-sub danger">
        没有可清理的旧证据，仍会超额：请提高容量上限或关闭证据保留。
      </p>
      <div class="modal-actions">
        <button class="modal-mini" @click="emit('cancel')">取消</button>
        <button
          class="modal-primary danger"
          :disabled="!plan.evictions.length"
          @click="emit('confirm')"
        >
          按此清单清理并继续
        </button>
      </div>
    </div>
  </div>
</template>
