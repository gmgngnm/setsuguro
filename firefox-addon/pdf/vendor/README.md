pdf.js 4.10.38 の legacy ビルドを dist からそのまま置いたもの。中身は触らない。

なぜ legacy の 4.x かというと、5.x と 6.x は Map.prototype.getOrInsertComputed
（2025年に入ったばかりの仕組み）を使っていて、少し古いブラウザでは動かないため。

入れ替えるときは npm pack pdfjs-dist@4 で取って、legacy/build/pdf.min.mjs,
legacy/build/pdf.worker.min.mjs, legacy/web/pdf_viewer.mjs, web/pdf_viewer.css を
上書きする。
