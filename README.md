# Turfline 賽馬直播廳

Turfline 係一隻繁體廣東話 3D 觀眾賽馬街機。每場有六匹賽駒，觀眾用虛擬代幣落注，可以由賽前亮相圈揀馬跟拍，直至 1,200 米終點。[進入遊戲](https://penny323mo.github.io/turfline/) · [模型庫](https://penny323mo.github.io/turfline/studio.html#library)

[v1.12.0 階段驗收紀錄](docs/stage-acceptance-v1.12.0.md)

## 第一場點玩

1. 賽前六駒會喺亮相圈慢行。揀一匹馬用場邊鏡睇步姿，或者用全場廣角睇晒六匹。初始餘額為 1,000 枚。選擇獨贏、位置或連贏，揀馬同注碼，按「確認投注」。每注最少 10 枚，開跑前可取消。
2. 手機撳「揀馬投注」可直接打開投注單。確認後，撳單底嘅「跟拍…並開跑」就會返到馬場，跟住最後一張有效注單嘅首選馬倒數出閘。想先睇一場，可以喺直播畫面撳「不投注開跑」。同場可落多張注單。封盤後六駒喺各自閘廂倒數三秒，再同步開閘。全螢幕亦可以開跑同切換 1×／2×。
3. 點出馬表或直播走位列嘅馬號切換焦點馬。按 1、2、3 選擇場邊跟拍、高空俯視、直播長鏡。按 4 用全場廣角睇齊六駒，可直接點畫面中嘅馬匹。手機打直全螢幕時，廣角會沿跑道方向俯拍。按 5 開自動導播，會按焦點馬跑到嘅位置切鏡。按 7 用騎姿近鏡睇騎師雙手、韁繩同馬頭。賽事支援全螢幕、馬蹄聲及 2× 轉播。
4. 獨贏須選中頭馬，位置須入前二，連贏須選中頭兩名而不分先後。派彩包含本金，使用每張注單確認時的賠率。
5. 全部衝線後結算。「賽績」保留最近 20 場。餘額不足最低注碼而本場亦無注單時，可以免費補充代幣。

每六場為一個賽日。每場頭六名依次得 10、6、4、3、2、1 分。同分先比頭馬次數，再比最近一場名次。按「賽日積分」可睇本日形勢同近期完整賽日，亦可喺賽果直接睇到積分領先馬。第六場完結後會顯示賽日總冠軍。

馬匹慢行時四腳交替着地，封盤後鏡頭切去起步閘。開跑後，前肩隨承重同伸腳前後移動，鬃毛跟住馬頸擺動。[亮相、出閘同疾馳實機片段](https://penny323mo.github.io/turfline/views/parade-and-gallop.mp4)

在出馬表點獨贏或位置賠率，可將該匹馬帶入投注單，按「確認投注」才會扣代幣。第二場起，投注單會顯示所選馬匹最近三次已完成賽事的名次。

直播畫面下方嘅「分段戰報」會喺頭馬跑過 100 米、轉入直路、進入最後 200 米同衝線時，記低當刻帶頭馬同時間。完場後撳任何一段，可以跟住嗰匹馬重睇過點前三秒至後兩秒。全螢幕亦可以喺「賽事重播」揀「分段精華」切換片段。

完賽後按「賽事重播」，預設重看頭馬壓線前 4.5 秒至最後一匹馬過終點。左邊選單可揀「全場重播」由倒數開始，或者揀「過線收步」睇馬匹衝線後逐步減速至四蹄企穩。可以暫停、拖動、換馬，亦可以用 0.25×、0.5× 或原速播放。「頭馬壓線」會停喺正式冠軍時間並切去終點定鏡。可以再揀第 2 至第 6 名，逐匹睇馬鼻對住終點線嗰刻；時間同相鄰名次嘅差距顯示至千分一秒。各分頁獨立重播，派彩按正式過線次序結算。[出閘至收步實機片段](https://penny323mo.github.io/turfline/views/gate-and-pull-up.mp4)

重播片段揀「步姿慢鏡」，側鏡會停喺焦點馬最接近當前時間嘅一次落蹄，黃色圓圈標示邊隻腳着地。用「上一蹄／下一蹄」來回睇，亦可以用四分一速度播放。每匹馬按自己步幅伸腳，轉彎同收步時按跑線修正受力蹄嘅位置。[6 號馬逐蹄實機慢鏡](https://penny323mo.github.io/turfline/views/footwork.mp4)

步姿慢鏡入面揀「睇換腳」，可以跳到焦點馬入彎換右腳，或者出彎換左腳嘅第一下領先前蹄着地。按「上一蹄／下一蹄」觀察落腳次序，按「播放」可以用四分一速度連續睇。換腳點會隨每匹馬嘅跑線同步幅而異，舊賽事保留原先嘅步序。[6 號馬兩次換腳實機慢鏡](https://penny323mo.github.io/turfline/views/lead-changes.mp4)

按「音效」可聽焦點馬嘅四拍草地蹄聲。換馬會切換步幅同節奏，2× 轉播及終點慢鏡會跟畫面調整。暫停或拖動重播時蹄聲會停，全螢幕右上角亦可以開關音效。[實機蹄聲試聽](https://penny323mo.github.io/turfline/views/hoofbeats.mp4)

正式賽事喺對面直路起步，跑過半徑 120 米嘅右彎，再入最後 480 米直路。馬匹入彎會逐步向內傾，外疊馬按自己實際跑過嘅路程踏步。側鏡可以睇到馬腰收放、馬頸前伸，同埋騎師屈膝、手肘順住馬頭活動。[彎位實機片段，附半速側鏡](https://penny323mo.github.io/turfline/views/bend-gallop.mp4)

開新一場後，馬匹會按馬群前後距離選擇貼欄或移出外疊。揀「走位圖」可以睇每匹馬最近 18 米嘅跑線，點馬號可切換焦點。側鏡會按馬群位置揀較少遮擋嘅一側。舊賽事以原有檔位重播。[3 號馬移出外疊超越 5 號實機片段](https://penny323mo.github.io/turfline/views/running-lines.mp4)

走位列按畫面當刻嘅名次排列，全螢幕同重播期間亦可點馬號跟拍。同一分頁重新整理會記住原有焦點同機位，離開重播後會返回原先嘅選擇。

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

使用 `npm run measure:playback` 可用 Chrome 嘅 SwiftShader 重播同一段六駒彎位。工具量度場邊、騎姿及廣角由畫布實際送到影片嘅格率。可透過 `TURFLINE_URL` 指定測試版本。

推送到 `main` 後，[GitHub Actions](.github/workflows/pages.yml) 會安裝鎖定版本、執行規則測試、編譯、在專案子路徑運行 Chromium 測試，然後由 GitHub Pages 發佈同一份產物。

## 賽事與存檔

賠率來自當場六匹馬的相對勝算。封盤後按相同權重抽出名次及完賽時間，渲染根據同一份賽程逐幀計算馬匹距離。投注內容、焦點鏡頭和轉播速度都不參與抽籤。

遊戲在本機 IndexedDB 同一筆交易內更新注單、錢包及賽果，多個分頁亦只會結算一次。重新整理可繼續同一場。不同裝置或瀏覽器使用各自的存檔，清除網站資料會重置進度。若瀏覽器封鎖儲存，頁面會標明暫存模式。WebGL 2 可顯示完整 3D，設備無法建立 WebGL 場景時提供即時 2D 走位圖。

## 驗收模型

- [軟件渲染實況對照](https://penny323mo.github.io/turfline/views/software-playback.mp4) 上下同步播放同一場彎位，保留瀏覽器實際輸出嘅影格間距。

- [6 號馬實機慢鏡](https://penny323mo.github.io/turfline/views/rider-follow.mp4) 先用側鏡睇四蹄收放，再近看騎師雙手如何跟住馬頸伸收。

- [新舊馬步對照](https://penny323mo.github.io/turfline/views/gallop-comparison.mp4) 用同一場賽事、同一秒嘅側鏡，先原速再半速播放。1 號馬全速疾馳時每步行 7.05 米，出閘同收步時步幅較短。直播同重播都按實際前進距離驅動。
- 在名單中選擇追蹤馬匹。模型室按 1 至 4 切換場邊跟拍、俯視、直播長鏡同[騎姿近鏡](https://penny323mo.github.io/turfline/studio.html?view=rider)。
- 按空白鍵暫停，用時間軸檢查馬步。畫面右上角的倍率按鈕可切換 1×、1.4× 和 1.8×。
- 在「模型庫」進入場地定點鏡頭，或者點擊「同機位比較」直接檢查其中一個候選的馬頸、腳部及騎師姿勢。
- 模型觀測台的試跑時間軸為 76 秒，循環展示直路。正式賽事使用獨立賽程。

| 馬匹候選 | 馬匹資產三角面 | 來源與用途 |
| --- | ---: | --- |
| Ayan | 32,124 | [Sketchfab 原作](https://sketchfab.com/3d-models/animated-rigged-horse-with-saddle-b08743c2c4734fb98a4e0a2f5767c318)，CC BY 4.0。保留原作骨架，配上按路程驅動嘅四拍疾馳。 |
| Ranch | 37,160 | [Rigged Horse](https://opengameart.org/content/rigged-horse)，CC0。牧場馬體型，2K 貼圖，已移植待機及疾馳動作。 |
| Quaternius | 2,182 | [Ultimate Animated Animal Pack](https://quaternius.com/packs/ultimateanimatedanimals.html)，CC0。低面數對照。 |

騎師與綵衣為本作製作。以上面數來自原始或轉製馬匹 GLB 的三角形索引，另加的騎師與裝備獨立計算。單檔 GLB、署名及修改詳情見 [models](public/models)。馬場採用 [Racecourse and Parade Ring](https://3dassets.dev/packs/racecourse-and-parade-ring)，天空與草地另見 [場景攝影來源](public/environment/credits.md)。

## 街機玩法參考

SEGA 於 2000 年推出《StarHorse》，以個人投注終端配合大畫面播放賽事。KONAMI 的《GⅠ-CLASSIC》於 1995 年推出，同系列的《GI-Turf TV》以選馬、預測名次或組合、按賠率派代幣為觀眾操作核心。Turfline 使用虛擬代幣，場景與馬匹使用上述獨立素材。[SEGA 官方歷史](https://www.sega.jp/history/companyTimeline/en/) · [KONAMI 歷代作品](https://www.konami.com/corporate/ja/history/license.html) · [KONAMI 馬券玩法](https://www.konami.com/arcadegames/products/site/am_g1turftv/info.html?stab=tab_e)
