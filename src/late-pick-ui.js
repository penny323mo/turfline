import { horses } from "./data.js";
import { latePickEnd, latePickForm, latePickOpen, latePickRewards, latePickStart, trendSeconds } from "./late-pick.js";
import { snapshotAt } from "./race.js";

export function describeLatePick(pick, unit = "枚") {
  const label = horses[pick.runner].name + "（第 " + pick.rank + " 位時選中）";
  if (pick.paid === undefined) return label + " · 估中得 " + pick.reward + " " + unit;
  return label + (pick.paid ? " · 估中 +" + pick.paid + " " + unit : " · 未中");
}

export function createLatePick(onPick, unit = "枚") {
  const panel = document.getElementById("late-pick");
  const status = document.getElementById("late-status");
  const options = document.getElementById("late-options");
  const buttons = horses.map((horse, i) => {
    const button = document.createElement("button");
    button.type = "button";
    button.style.setProperty("--silk", horse.color);
    button.innerHTML = '<span class="pick-horse"><b>' + horse.number + '</b>' + horse.name +
      '</span><small class="pick-gap"></small><strong></strong><small class="pick-trend"></small>';
    button.onclick = async () => {
      const message = await onPick(i, Number(button.dataset.reward));
      if (message && !options.hidden) status.textContent = message;
    };
    options.append(button);
    return button;
  });
  let lastStatus;
  return (race, frame, replay, ready) => {
    const available = latePickOpen(race, frame) && !race.latePick;
    panel.hidden = replay || (!race.latePick && (race.phase !== "running" || frame.t < 0));
    options.hidden = panel.hidden || !available;
    if (panel.hidden) return;
    const message = race.latePick ? describeLatePick(race.latePick, unit) : available
      ? "免費揀頭馬 · 近 " + trendSeconds + " 秒走勢 · 最後 " + latePickEnd + " 米截止"
      : frame.remaining > latePickStart ? "入直路開放 · 免費揀頭馬" : "預測已截止";
    if (message !== lastStatus) {
      status.textContent = message;
      lastStatus = message;
    }
    if (!available) return;
    const previous = snapshotAt(race, frame.t - trendSeconds);
    for (const [rank, runner] of frame.order.entries()) {
      const button = buttons[runner];
      const { gap, label, trend } = latePickForm(frame, previous, runner);
      const reward = latePickRewards[rank];
      button.disabled = !ready;
      button.dataset.reward = String(reward);
      button.children[1].textContent = gap;
      button.children[2].textContent = "+" + reward + " " + unit;
      button.lastElementChild.textContent = label;
      button.lastElementChild.dataset.trend = trend;
      button.setAttribute("aria-label", horses[runner].name + "，第 " + (rank + 1) + " 位，" + gap +
        "，近 " + trendSeconds + " 秒" + label + "，估中得 " + reward + " " + unit);
    }
  };
}
