# Turfline 賽馬直播廳

Turfline 係一隻繁體廣東話 3D 觀眾賽馬街機。每場有六匹賽駒，觀眾用虛擬代幣落注，封盤後可揀馬跟拍，直至 1,200 米終點。[進入遊戲](https://penny323mo.github.io/turfline/) · [模型庫](https://penny323mo.github.io/turfline/studio.html#library)

## 第一場點玩

1. 初始餘額為 1,000 枚。選擇獨贏、位置或連贏，揀馬同注碼，按「確認投注」。每注最少 10 枚，開跑前可取消。
2. 按「封盤開跑」開始三秒倒數。可以純觀賽，或者同一場落多張注單。
3. 點出馬表或直播下方選單切換焦點馬，按 1、2、3 選擇場邊跟拍、高空俯視、直播長鏡。賽事支援全螢幕、馬蹄聲及 2× 轉播。
4. 獨贏須選中頭馬，位置須入前二，連贏須選中頭兩名而不分先後。派彩包含本金，使用每張注單確認時的賠率。
5. 全部衝線後結算。「賽績」保留最近 20 場。餘額不足最低注碼而本場亦無注單時，可以免費補充代幣。

在出馬表點獨贏或位置賠率，可將該匹馬帶入投注單，按「確認投注」才會扣代幣。第二場起，投注單會顯示所選馬匹最近三次已完成賽事的名次。

完賽後按「終點重播」可重看頭馬壓線前 4.5 秒至最後一匹馬過終點。支援暫停、拖動、0.25×、0.5× 及原速播放。「頭馬壓線」會停在正式冠軍時間，3D 畫面會切換至終點定鏡。各分頁可以獨立重播，賽果與派彩維持原有紀錄。

## 運行與發佈

使用 Node.js 24 或以上，在專案目錄執行：

```sh
npm ci
npm run dev
```

開發伺服器預設使用本機 4173 埠。正式版本由 esbuild 編譯成靜態檔，兩個頁面及 WebGL 素材均支援 GitHub Pages 專案路徑。

```sh
npm test
npm run build
npm run preview
```

Production 預覽預設使用本機 4174 埠。在另一個 Terminal 執行 `npm run smoke`，會以獨立瀏覽器資料測試落注、跨分頁同步、重載續賽、派彩及模型庫。macOS 可使用已安裝的 Google Chrome；亦可執行 `npx playwright-core install chromium` 安裝測試瀏覽器。以 `TURFLINE_URL` 指定網址，設 `TURFLINE_REALTIME=1` 可按真實時間完成測試賽事。

推送到 `main` 後，[GitHub Actions](.github/workflows/pages.yml) 會安裝鎖定版本、執行規則測試、編譯、在專案子路徑運行 Chromium 測試，然後由 GitHub Pages 發佈同一份產物。

## 賽事與存檔

賠率來自當場六匹馬的相對勝算。封盤後按相同權重抽出名次及完賽時間，渲染根據同一份賽程逐幀計算馬匹距離。投注內容、焦點鏡頭和轉播速度都不參與抽籤。

遊戲在本機 IndexedDB 同一筆交易內更新注單、錢包及賽果，多個分頁亦只會結算一次。重新整理可繼續同一場。不同裝置或瀏覽器使用各自的存檔，清除網站資料會重置進度。若瀏覽器封鎖儲存，頁面會標明暫存模式。WebGL 2 可顯示完整 3D，設備無法建立 WebGL 場景時提供即時 2D 走位圖。

## 驗收模型

- 在名單中選擇追蹤馬匹。按 1、2、3 切換場邊跟拍、俯視和直播長鏡。
- 按空白鍵暫停，用時間軸檢查馬步。畫面右上角的倍率按鈕可切換 1×、1.4× 和 1.8×。
- 在「模型庫」進入場地定點鏡頭，或者點擊「同機位比較」直接檢查其中一個候選的馬頸、腳部及騎師姿勢。
- 模型觀測台的試跑時間軸為 76 秒，循環展示直路。正式賽事使用獨立賽程。

| 馬匹候選 | 馬匹資產三角面 | 來源與用途 |
| --- | ---: | --- |
| Ayan | 32,124 | [Sketchfab 原作](https://sketchfab.com/3d-models/animated-rigged-horse-with-saddle-b08743c2c4734fb98a4e0a2f5767c318)，CC BY 4.0。原有跑步骨架，預設競賽配裝。 |
| Ranch | 37,160 | [Rigged Horse](https://opengameart.org/content/rigged-horse)，CC0。牧場馬體型，2K 貼圖，已移植待機及疾馳動作。 |
| Quaternius | 2,182 | [Ultimate Animated Animal Pack](https://quaternius.com/packs/ultimateanimatedanimals.html)，CC0。低面數對照。 |

騎師與綵衣為本作製作。以上面數來自原始或轉製馬匹 GLB 的三角形索引，另加的騎師與裝備獨立計算。單檔 GLB、署名及修改詳情見 [models](public/models)。馬場採用 [Racecourse and Parade Ring](https://3dassets.dev/packs/racecourse-and-parade-ring)，天空與草地另見 [場景攝影來源](public/environment/credits.md)。

## 街機玩法參考

SEGA 於 2000 年推出《StarHorse》，以個人投注終端配合大畫面播放賽事。KONAMI 的《GⅠ-CLASSIC》於 1995 年推出，同系列的《GI-Turf TV》以選馬、預測名次或組合、按賠率派代幣為觀眾操作核心。Turfline 使用虛擬代幣，場景與馬匹使用上述獨立素材。[SEGA 官方歷史](https://www.sega.jp/history/companyTimeline/en/) · [KONAMI 歷代作品](https://www.konami.com/corporate/ja/history/license.html) · [KONAMI 馬券玩法](https://www.konami.com/arcadegames/products/site/am_g1turftv/info.html?stab=tab_e)
