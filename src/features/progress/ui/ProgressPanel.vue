<script setup lang="ts">
import { Check } from "lucide-vue-next";
defineProps<{ percent: number; status: string }>();
</script>
<template>
  <section class="progress-panel">
    <div class="reading-progress">
      <div>
        <span>全书阅读进度</span><b>{{ percent }}%</b>
      </div>
      <div class="progress-track">
        <i :style="{ width: `${percent}%` }"></i>
      </div>
      <p><Check :size="12" /> {{ status }}</p>
    </div>
  </section>
</template>
