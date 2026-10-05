/* 自前のPDFビューア。描くのは pdf.js（vendor/ にそのまま置いてある）に任せ、
   ここは「開く・めくる・拡大する」だけを受け持つ。
   このページは拡張機能自身のページなので、content.js をそのまま読み込める。
   Firefox の内蔵ビューアは resource:// のページで、そこには差し込めない */
import * as pdfjsLib from "./vendor/pdf.min.mjs";

/* 表示部品（pdf_viewer.mjs）は globalThis.pdfjsLib を見に行く作りなので、
   先に置いてから読み込む */
globalThis.pdfjsLib = pdfjsLib;
const { EventBus, PDFViewer, PDFLinkService } = await import("./vendor/pdf_viewer.mjs");

pdfjsLib.GlobalWorkerOptions.workerSrc = "vendor/pdf.worker.min.mjs";

const el = {
  open: document.getElementById("open"),
  file: document.getElementById("file"),
  name: document.getElementById("name"),
  scale: document.getElementById("scale"),
  zoomIn: document.getElementById("in"),
  zoomOut: document.getElementById("out"),
  pages: document.getElementById("pages"),
  note: document.getElementById("note"),
  container: document.getElementById("viewerContainer"),
};

const eventBus = new EventBus();
const linkService = new PDFLinkService({ eventBus });
const viewer = new PDFViewer({
  container: el.container,
  viewer: document.getElementById("viewer"),
  eventBus,
  linkService,
  /* 書き込みの道具は要らない。出すと、使わない飾りの絵を取りに行って
     見つからない、という雑音になる */
  annotationEditorMode: 0,
});
linkService.setViewer(viewer);

eventBus.on("pagesinit", () => {
  viewer.currentScaleValue = "page-width";
  showScale();
  /* 枚数が決まるのはここ。setDocument の直後に数えると 0 のまま */
  showPages();
});
eventBus.on("scalechanging", showScale);
eventBus.on("pagechanging", showPages);

function showScale() {
  el.scale.textContent = `${Math.round(viewer.currentScale * 100)}%`;
}

function showPages() {
  if (!viewer.pdfDocument) return;
  el.pages.textContent = `${viewer.currentPageNumber} / ${viewer.pagesCount}`;
}

function say(message) {
  el.note.textContent = message || "";
}

async function show(source, label) {
  say("");
  el.name.textContent = label;
  document.title = `${label} — Cursor Translator`;
  try {
    /* 鍵の要るページに置かれたPDFもあるので、ログインの記録を付けて取りに行く */
    const task = pdfjsLib.getDocument(Object.assign({ withCredentials: true }, source));
    const doc = await task.promise;
    viewer.setDocument(doc);
    linkService.setDocument(doc, null);
  } catch (err) {
    console.warn("PDFを開けませんでした:", err);
    say(`開けませんでした: ${err && err.message ? err.message : err}`);
  }
}

el.open.addEventListener("click", () => el.file.click());
el.file.addEventListener("change", async () => {
  const file = el.file.files && el.file.files[0];
  if (!file) return;
  /* 手元のファイルは読み込んでしまう。file:// を開くわけではないので、
     「ローカルファイルへのアクセス」の許可は要らない */
  show({ data: new Uint8Array(await file.arrayBuffer()) }, file.name);
});

el.zoomIn.addEventListener("click", () => {
  viewer.currentScale = Math.min(viewer.currentScale * 1.1, 10);
});
el.zoomOut.addEventListener("click", () => {
  viewer.currentScale = Math.max(viewer.currentScale / 1.1, 0.1);
});

/* 字を埋め込んでいないPDFは、同梱していない標準フォントを欲しがる。
   字が出ないときに理由が分からないと困るので、そのときだけ断っておく */
eventBus.on("documenterror", (e) => say(`開けませんでした: ${e && e.message ? e.message : ""}`));

const wanted = new URLSearchParams(location.search).get("file");
if (wanted) {
  show({ url: wanted }, decodeURIComponent(wanted.split("/").pop() || wanted));
} else {
  say("");
  el.open.focus();
}
