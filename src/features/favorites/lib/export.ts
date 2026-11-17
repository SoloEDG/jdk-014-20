import type { ComicDocument } from "../../../shared/document";
import type { Favorite, FavoriteCollection } from "../../../shared/favorites";

export interface ExportPayload {
  format: "panel-favorites/1";
  exportedAt: string;
  documentId: string;
  documentTitle: string;
  collection: { id: string; name: string; created: number };
  count: number;
  records: {
    id: string;
    label: string;
    note: string;
    status: Favorite["status"];
    staleReason: Favorite["staleReason"];
    location: Favorite["location"];
    region: Favorite["region"];
    hasEvidence: boolean;
    evidence: string | null;
    created: number;
    updated: number;
  }[];
}

function download(filename: string, text: string) {
  const blob = new Blob([text], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** 删除集合前可导出其中记录（含证据缩略图），避免误删后无法追溯 */
export function exportCollection(
  doc: ComicDocument,
  collection: FavoriteCollection,
  favorites: Favorite[],
  includeEvidence: boolean,
) {
  const records = favorites
    .filter((f) => f.collectionId === collection.id)
    .map((f) => ({
      id: f.id,
      label: f.label,
      note: f.note,
      status: f.status,
      staleReason: f.staleReason,
      location: f.location,
      region: f.region,
      hasEvidence: Boolean(f.evidence),
      evidence: includeEvidence ? f.evidence : null,
      created: f.created,
      updated: f.updated,
    }));
  const payload: ExportPayload = {
    format: "panel-favorites/1",
    exportedAt: new Date().toISOString(),
    documentId: doc.id,
    documentTitle: doc.title,
    collection: {
      id: collection.id,
      name: collection.name,
      created: collection.created,
    },
    count: records.length,
    records,
  };
  const safe = collection.name.replace(/[\\/:*?"<>|]/g, "_");
  download(`收藏集-${safe}-${Date.now()}.json`, JSON.stringify(payload, null, 2));
  return records.length;
}
