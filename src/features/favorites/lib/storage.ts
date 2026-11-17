import type {
  ComicDocument,
  ReadingLocation,
} from "../../../shared/document";
import {
  DEFAULT_SETTINGS,
  type Favorite,
  type FavoriteCollection,
  type FavoriteSettings,
} from "../../../shared/favorites";

const KEY = "panel-jdk014-v2";
const LEGACY_KEY = "panel-jdk014-v1";

export interface SavedSessionV2 {
  document: ComicDocument;
  location: ReadingLocation;
  collections: FavoriteCollection[];
  favorites: Favorite[];
  settings: FavoriteSettings;
}

interface LegacySession {
  document: ComicDocument;
  location: ReadingLocation;
  bookmarks: { id: string; label: string; location: ReadingLocation; created: number }[];
}

/**
 * v1 书签迁移：旧书签是整格收藏，转为格内全区域（0,0,1,1）收藏，
 * 指纹留空，首次 reconcile 时按当前画面回填，不会误报失效。
 */
function migrateLegacy(): SavedSessionV2 | null {
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    if (!raw) return null;
    const legacy = JSON.parse(raw) as LegacySession;
    if (legacy.document?.version !== 1 || !Array.isArray(legacy.bookmarks))
      return null;
    const collection: FavoriteCollection = {
      id: "collection-migrated",
      name: "迁移的旧书签",
      created: Date.now(),
    };
    const favorites: Favorite[] = legacy.bookmarks.map((b) => ({
      id: b.id,
      label: b.label,
      note: "由旧版整格书签迁移",
      collectionId: collection.id,
      location: { ...b.location },
      region: { x: 0, y: 0, width: 1, height: 1 },
      status: "accurate",
      staleReason: null,
      panelFingerprint: "",
      imageHash: "",
      evidence: null,
      created: b.created,
      updated: b.created,
    }));
    return {
      document: legacy.document,
      location: legacy.location,
      collections: [collection],
      favorites,
      settings: { ...DEFAULT_SETTINGS },
    };
  } catch {
    return null;
  }
}

export function readSession(): SavedSessionV2 | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const value = JSON.parse(raw) as SavedSessionV2;
      if (
        value.document?.version === 1 &&
        Array.isArray(value.collections) &&
        Array.isArray(value.favorites)
      ) {
        value.settings = { ...DEFAULT_SETTINGS, ...value.settings };
        return value;
      }
    }
    return migrateLegacy();
  } catch {
    return null;
  }
}

export function writeSession(value: SavedSessionV2): string {
  try {
    localStorage.setItem(KEY, JSON.stringify(value));
    return "已保存到此浏览器";
  } catch {
    return "存储空间不足，本次修改仅保留在当前页面；请清理证据缩略图或减少导入图片";
  }
}
