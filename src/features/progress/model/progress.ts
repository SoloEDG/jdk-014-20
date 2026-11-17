import { computed, type Ref } from "vue";
import type {
  ComicDocument,
  ReadingLocation,
} from "../../../shared/document";
import { readingMetrics } from "../lib/metrics";
export function useProgress(
  doc: Ref<ComicDocument>,
  location: Ref<ReadingLocation>,
) {
  const metrics = computed(() => readingMetrics(doc.value, location.value));
  function reconcile() {
    // 位置合法性由 reader.normalize 保证；收藏状态核对在 favorites 模块
  }
  return { metrics, reconcile };
}
