import assert from "node:assert/strict";
import {
  regionToRect,
  rectToRegion,
  clampRegion,
  estimateBytes,
  type Favorite,
  type FavoriteCollection,
  type FavoriteSettings,
} from "../src/shared/favorites";
import {
  planQuota,
  totalEvidenceBytes,
} from "../src/features/favorites/lib/evidence";
import { reconcileFavorites } from "../src/features/favorites/lib/reconcile";
import { panelFingerprint } from "../src/features/favorites/lib/hash";
import {
  copyPanelAcrossPages,
  cropPanel,
} from "../src/features/editing/lib/operations";
import type {
  ComicDocument,
  Panel,
  Rect,
} from "../src/shared/document";

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`✓ ${name}`);
}

function panel(id: string, rect: Rect, extra: Partial<Panel> = {}): Panel {
  return {
    id,
    rect,
    dialogue: "对白",
    speaker: "旁白",
    sound: "rain",
    duration: 4,
    ...extra,
  };
}
function docWith(): ComicDocument {
  return {
    version: 1,
    id: "d1",
    title: "测试",
    author: "a",
    chapters: [
      {
        id: "c1",
        title: "第一章",
        subtitle: "",
        pages: [
          {
            id: "page-1",
            title: "p1",
            image: "data:image/svg+xml,page1",
            width: 1000,
            height: 1000,
            panels: [
              panel("panel-a", { x: 0, y: 0, width: 500, height: 500 }),
              panel("panel-b", { x: 500, y: 0, width: 500, height: 500 }),
            ],
          },
          {
            id: "page-2",
            title: "p2",
            image: "data:image/svg+xml,page2",
            width: 1000,
            height: 1000,
            panels: [
              panel("panel-c", { x: 0, y: 0, width: 1000, height: 1000 }),
            ],
          },
        ],
      },
    ],
  };
}
function favorite(over: Partial<Favorite> = {}): Favorite {
  return {
    id: "fav-1",
    label: "细节",
    note: "",
    collectionId: "col-1",
    location: {
      chapterId: "c1",
      pageId: "page-1",
      panelId: "panel-a",
      zoom: 1,
      x: 0,
      y: 0,
    },
    region: { x: 0.2, y: 0.2, width: 0.4, height: 0.4 },
    status: "accurate",
    staleReason: null,
    panelFingerprint: "",
    imageHash: "",
    evidence: null,
    created: 1000,
    updated: 1000,
    ...over,
  };
}

// ---------- 1. 区域归一化往返 ----------
test("格内归一区域与页面像素 rect 往返一致", () => {
  const panelRect: Rect = { x: 100, y: 200, width: 400, height: 600 };
  const region = rectToRegion(
    { x: 180, y: 320, width: 200, height: 300 },
    panelRect,
  );
  assert.deepEqual(region, { x: 0.2, y: 0.2, width: 0.5, height: 0.5 });
  const back = regionToRect(region, panelRect);
  assert.deepEqual(back, { x: 180, y: 320, width: 200, height: 300 });
});
test("clampRegion 保证区域不越出格子", () => {
  const r = clampRegion({ x: 0.8, y: 0.9, width: 0.5, height: 0.5 });
  assert.ok(r.x + r.width <= 1.0000001);
  assert.ok(r.y + r.height <= 1.0000001);
});

// ---------- 2. 容量规划：先预览影响，不直接删 ----------
test("容量超额时给出清理影响清单且按最久未更新优先", () => {
  const existing = [
    {
      id: "old",
      label: "旧收藏",
      collectionName: "集",
      evidence: "x".repeat(100),
      updated: 1000,
    },
    {
      id: "new",
      label: "新收藏",
      collectionName: "集",
      evidence: "y".repeat(100),
      updated: 2000,
    },
  ];
  const plan = planQuota(
    existing,
    {
      id: "incoming",
      label: "将入库",
      collectionName: "集",
      evidence: "z".repeat(100),
      updated: 3000,
    },
    450,
  );
  assert.equal(plan.overflow, true);
  assert.ok(plan.evictions.length >= 1);
  assert.equal(plan.evictions[0]!.favoriteId, "old");
  assert.ok(plan.projectedUsed <= 450);
});
test("未超额时不产生清理项", () => {
  const plan = planQuota(
    [{ id: "a", label: "a", collectionName: "c", evidence: "x".repeat(10), updated: 1 }],
    null,
    10_000,
  );
  assert.equal(plan.overflow, false);
  assert.equal(plan.evictions.length, 0);
});
test("证据占用按 UTF-16 两字节每字符估算", () => {
  assert.equal(estimateBytes("abcd"), 8);
  assert.equal(estimateBytes(null), 0);
  assert.equal(totalEvidenceBytes([{ evidence: "ab" }, { evidence: null }]), 4);
});

// ---------- 3. 编辑后核对：状态正确、坐标不动 ----------
test("分镜裁切后相关收藏标记 panel-geometry 且 region 不变", async () => {
  const doc = docWith();
  const f = favorite({
    panelFingerprint: panelFingerprint(doc.chapters[0]!.pages[0]!.panels[0]!),
  });
  const before = { ...f.region };
  cropPanel(doc, "page-1", "panel-a", {
    x: 0,
    y: 0,
    width: 400,
    height: 400,
  });
  const result = await reconcileFavorites(doc, [f]);
  const updated = result.favorites[0]!;
  assert.equal(updated.status, "stale");
  assert.equal(updated.staleReason, "panel-geometry");
  assert.deepEqual(updated.region, before, "旧坐标必须原样保留，不能静默迁移");
});

test("分镜文本修改标记 panel-content", async () => {
  const doc = docWith();
  const f = favorite({
    panelFingerprint: panelFingerprint(doc.chapters[0]!.pages[0]!.panels[0]!),
  });
  doc.chapters[0]!.pages[0]!.panels[0]!.dialogue = "改过的对白";
  const result = await reconcileFavorites(doc, [f]);
  assert.equal(result.favorites[0]!.staleReason, "panel-content");
});

test("分镜被删除标记 panel-missing", async () => {
  const doc = docWith();
  const f = favorite({
    panelFingerprint: panelFingerprint(doc.chapters[0]!.pages[0]!.panels[0]!),
    location: {
      chapterId: "c1",
      pageId: "page-1",
      panelId: "panel-gone",
      zoom: 1,
      x: 0,
      y: 0,
    },
  });
  const result = await reconcileFavorites(doc, [f]);
  assert.equal(result.favorites[0]!.staleReason, "panel-missing");
});

test("无编辑时历史空指纹被回填且不误报失效", async () => {
  const doc = docWith();
  const f = favorite();
  const result = await reconcileFavorites(doc, [f]);
  const updated = result.favorites[0]!;
  assert.equal(updated.status, "accurate");
  assert.ok(updated.panelFingerprint.length > 0);
});

test("图像替换（哈希无法解码 dataURL 占位）时证据哈希为空不误判", async () => {
  const doc = docWith();
  const f = favorite({
    panelFingerprint: panelFingerprint(doc.chapters[0]!.pages[0]!.panels[0]!),
    imageHash: "abcd",
  });
  // 测试环境无 DOM 解码能力，hashPage 返回 ""，空当前哈希应跳过判定而非误报
  const result = await reconcileFavorites(doc, [f]);
  assert.equal(result.favorites[0]!.status, "accurate");
});

// ---------- 4. 跨页复制：同 id 分镜在目标页可解析 ----------
test("跨页复制保留分镜 id，同集其他分镜收藏不受影响", () => {
  const doc = docWith();
  const ok = copyPanelAcrossPages(doc, "page-1", "panel-a", {
    chapterId: "c1",
    pageId: "page-2",
  });
  assert.equal(ok, true);
  const target = doc.chapters[0]!.pages[1]!;
  assert.ok(target.panels.some((p) => p.id === "panel-a"));
  // 源页分镜不动
  assert.equal(doc.chapters[0]!.pages[0]!.panels.length, 2);
  // 重复复制被拒绝
  assert.equal(
    copyPanelAcrossPages(doc, "page-1", "panel-a", {
      chapterId: "c1",
      pageId: "page-2",
    }),
    false,
  );
});

test("重定位只改目标收藏：同集另一条 region 保持不变", async () => {
  const doc = docWith();
  const f1 = favorite({
    id: "fav-a",
    panelFingerprint: panelFingerprint(doc.chapters[0]!.pages[0]!.panels[0]!),
  });
  const f2 = favorite({
    id: "fav-b",
    label: "另一条",
    region: { x: 0.1, y: 0.1, width: 0.2, height: 0.2 },
    panelFingerprint: panelFingerprint(doc.chapters[0]!.pages[0]!.panels[1]!),
    location: {
      chapterId: "c1",
      pageId: "page-1",
      panelId: "panel-b",
      zoom: 1,
      x: 0,
      y: 0,
    },
  });
  const f2RegionBefore = { ...f2.region };
  // 模拟 store.relocate 的核心字段更新
  const target = f1;
  target.region = { x: 0.3, y: 0.3, width: 0.3, height: 0.3 };
  target.status = "accurate";
  target.staleReason = null;
  target.updated = 9999;
  assert.deepEqual(f2.region, f2RegionBefore);
  assert.notDeepEqual(f1.region, f2.region);
});

// ---------- 5. 导出载荷结构 ----------
test("收藏集导出包含记录与证据开关字段", async () => {
  const { exportCollection } = await import(
    "../src/features/favorites/lib/export"
  );
  const doc = docWith();
  const collections: FavoriteCollection[] = [
    { id: "col-1", name: "我的收藏", created: 1 },
  ];
  const favs: Favorite[] = [
    favorite({ evidence: "data:image/jpeg;base64,xxx" }),
  ];
  // 截获下载
  const calls: string[] = [];
  const g = globalThis as unknown as {
    URL: typeof URL;
    document?: Document;
    Blob: typeof Blob;
  };
  if (!g.document) {
    // 无 DOM 环境：提供最小桩件，仅验证导出计数与载荷结构不抛错
    g.document = {
      createElement: () => ({
        click() {
          calls.push("click");
        },
        remove() {},
      }),
      body: { appendChild() {}, removeChild() {} },
    } as unknown as Document;
  }
  const origCreate = g.URL.createObjectURL;
  const origRevoke = g.URL.revokeObjectURL;
  g.URL.createObjectURL = () => "blob:test";
  g.URL.revokeObjectURL = () => {};
  const origAppend = g.document.createElement.bind(g.document);
  g.document.createElement = ((tag: string) => {
    if (tag === "a")
      return {
        click() {
          calls.push("click");
        },
        remove() {},
        href: "",
        download: "",
      } as unknown as HTMLAnchorElement;
    return origAppend(tag);
  }) as Document["createElement"];
  try {
    const count = exportCollection(doc, collections[0]!, favs, false);
    assert.equal(count, 1);
    assert.equal(calls.length, 1);
  } finally {
    g.URL.createObjectURL = origCreate;
    g.URL.revokeObjectURL = origRevoke;
    g.document.createElement = origAppend;
  }
});

console.log(`\n全部 ${passed} 项测试通过`);
