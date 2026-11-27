import { horses } from "./data.js";
import { meetNumber, meetRound, playerCard } from "./meet.js";
import { odds, styles } from "./race.js";
import { paceForRace, racePace } from "./race-pace.js";

const signed = value => (value > 0 ? "+" : "") + value.toLocaleString("zh-HK");

export function mountMeetCard(panel, onChoose) {
  panel.innerHTML = '<summary>六場心水卡</summary><p class="card-score"></p><ol class="card-rounds"></ol>' +
    '<div class="card-selection"><p>每場免費揀一匹，每匹只可用一次。開跑前可改選。頭六名順序得 10、6、4、3、2、1 分。</p>' +
    '<div class="card-runners" role="group" aria-label="本場心水"></div>' +
    '<button type="button" class="card-clear">取消本場心水</button></div>' +
    '<p class="card-feedback" role="status"></p>';
  const selection = panel.querySelector(".card-selection");
  const clear = panel.querySelector(".card-clear");
  clear.onclick = () => onChoose(null);
  const buttons = horses.map((horse, runner) => {
    const button = document.createElement("button");
    button.type = "button";
    button.innerHTML = '<strong>' + horse.number + ' ' + horse.name + '</strong><small></small>';
    button.style.setProperty("--silk", horse.color);
    button.onclick = () => onChoose(runner);
    panel.querySelector(".card-runners").append(button);
    return button;
  });
  return (game, day) => {
    const { race } = game;
    const { rounds, points, net } = playerCard(game, day);
    const round = meetRound(race.number);
    const selected = game.meetPicks?.[race.number];
    panel.querySelector(".card-score").textContent = "心水 " + points + "／60 分 · 賽日淨額 " + signed(net) + " 枚";
    panel.querySelector(".card-rounds").innerHTML = rounds.map((entry, index) => {
      const current = entry.number === race.number;
      const pace = racePace(current ? race : { pace: paceForRace(index + 1, day) }).name;
      const title = entry.runner != null ? horses[entry.runner].name : entry.net !== null ? "未選" : pace;
      const detail = entry.net !== null ? (entry.rank ? "第" + entry.rank + "名 · " + entry.points + "分" : "0 分") :
        current ? (race.phase === "open" ? "本場待開跑" : "比賽中") : "待開跑";
      return '<li' + (current ? ' aria-current="step"' : '') + '><small>第 ' + (index + 1) +
        ' 場</small><b>' + title + '</b><small>' + detail + '</small>' +
        (entry.net !== null ? '<small>淨額 ' + signed(entry.net) + ' 枚</small>' : '') + '</li>';
    }).join("");
    selection.hidden = day !== meetNumber(race.number) || race.phase !== "open";
    const feedback = panel.querySelector(".card-feedback");
    feedback.textContent = selection.hidden ? "" : selected == null ? "第 " + round + " 場未選心水" :
      "第 " + round + " 場心水 · " + horses[selected].name;
    if (selection.hidden) return;
    clear.hidden = selected == null;
    buttons.forEach((button, runner) => {
      const used = rounds.findIndex(entry => entry.number < race.number && entry.runner === runner);
      button.disabled = used !== -1;
      button.setAttribute("aria-pressed", String(selected === runner));
      button.lastElementChild.textContent = used === -1
        ? styles[runner] + " · 獨贏 " + odds(race, "win", [runner]).toFixed(1) + "×" : "第 " + (used + 1) + " 場已用";
    });
  };
}
