import { horses } from "./data.js";
import { latePickEnd, latePickOpen, latePickRewards, latePickStart } from "./late-pick.js";

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
      '</span><small></small><strong></strong>';
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
      ? "免費揀頭馬 · 最後 " + latePickEnd + " 米截止"
      : frame.remaining > latePickStart ? "入直路開放 · 免費揀頭馬" : "預測已截止";
    if (message !== lastStatus) {
      status.textContent = message;
      lastStatus = message;
    }
    if (!available) return;
    const leader = frame.ds[frame.order[0]];
    for (const [rank, runner] of frame.order.entries()) {
      const button = buttons[runner];
      const gap = rank === 0 ? "領先" : "−" + (leader - frame.ds[runner]).toFixed(1) + " 米";
      const reward = latePickRewards[rank];
      button.disabled = !ready;
      button.dataset.reward = String(reward);
      button.children[1].textContent = gap;
      button.lastElementChild.textContent = "+" + reward + " " + unit;
      button.setAttribute("aria-label", horses[runner].name + "，第 " + (rank + 1) + " 位，" + gap + "，估中得 " + reward + " " + unit);
    }
  };
}
