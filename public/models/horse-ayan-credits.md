# Animated Rigged Horse With Saddle

原作者為 [Ayan](https://sketchfab.com/ayanahmadbutt)。原作及其動畫按 [Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/) 授權。[Sketchfab 原作](https://sketchfab.com/3d-models/animated-rigged-horse-with-saddle-b08743c2c4734fb98a4e0a2f5767c318)

遊戲隨附的 GLB 是原始 Sketchfab 匯出檔，共有 32,124 個三角面、65 個骨骼關節及一段長約 1.042 秒的奔跑動作。自 [Objaverse 鏡像](https://huggingface.co/datasets/allenai/objaverse/resolve/main/glbs/000-045/b08743c2c4734fb98a4e0a2f5767c318.glb) 取得。SHA-256 為 `173695209a0ef603ade8f7840944f5b20c9a3d7b3df4127567210b05d202e985`。

Turfline 在遊戲中調整朝向、尺度和毛色，配上自製騎師、馬鞍與號碼布，保留原作頭絡，另製兩條競賽韁繩及口銜環。原有鞍具、側袋及西部韁繩在騎乘模式中隱藏。遊戲另製四拍疾馳，按前進距離分別驅動四肢，騎師透過膝部屈伸吸收馬背起伏。原裝 GLB 保留作者嘅動畫。

## 可獨立匯入的騎師連馬匹

[horse-ayan-mounted.glb](./horse-ayan-mounted.glb) 內嵌紅衫 1 號騎師、號碼布、馬鞍、韁繩、紋理及名為 `Gallop` 的循環動畫。米制，局部 +Z 向前。此檔是上述 Ayan 原作的 Turfline 衍生版本；原作採用 CC BY 4.0。檔案內亦載有作者、授權、來源網址及修改說明。

`Gallop` 以遊戲的 16 m/s 配速匯出，每循環約 0.441 秒，步幅 7.05 米。馬匹原有 65 個骨骼關節，另有 8 個騎師關節及 20 個韁繩與口銜環關節。四蹄接地、軀幹俯仰及騎師屈膝已寫入動畫。匯出檔使用赤焰流星配色。

步幅及步頻參考純種賽駒嘅賽事量度，四肢關節軌跡由 Turfline 為呢個模型編製。[研究摘要](https://pubmed.ncbi.nlm.nih.gov/33098592/)

彎位版本喺疾馳循環加入腰背屈伸、分段馬頸動作同騎師手肘伸縮。以上動作同時收錄喺騎師連馬匹 GLB。比賽時嘅入彎側傾同內外疊路程由遊戲按賽道即時計算。

同一個 GLB 另有兩段原地單次動作。`GateBreak` 重現 1 號馬最初 2.5 秒由企定到伸步，`PullUp` 重現衝線後 8 秒減速至停步。兩段包括騎師同馬匹，匯入時可設為播放一次。專案內執行 `node scripts/export-mounted.mjs` 可用 Chrome 從現有遊戲骨架重新匯出。

1.7 版按六匹馬各自嘅步幅解算四肢，落腳時會量度變形後嘅蹄底。馬腰同肩膊隨左右支撐腳轉動，馬尾同騎師上身會跟隨重心。騎師連馬匹 GLB 收錄 1 號馬嘅直線疾馳、出閘及收步，賽事轉彎嘅落腳位置由遊戲按當場跑線計算。

1.8 版加入收腳時嘅側向弧線，短步時馬頸同馬尾嘅擺幅會收細。兩條韁繩由左右手套連到各自嘅口銜環，手肘隨馬頭屈伸，頭部吸收部分上身俯仰。三段匯出動畫都有齊呢套動作。
