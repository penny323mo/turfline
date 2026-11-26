import { horses } from "./data.js";
import { checkpoints, raceMoments } from "./race-moments.js";
import { icon } from "./icons.js";

function raceCall(moments, index, t) {
  if (index < 0) return t < 0 ? "六駒就位，等候開閘。" : "馬群出閘，開始爭位。";
  const { leader, second, gap } = moments[index];
  const name = horses[leader].name;
  if (index === moments.length - 1) return name + "率先衝線！";
  const lead = index > 0 && moments[index - 1].leader !== leader ? "升上首位" : "領先";
  const margin = gap < 0.1 ? "兩駒幾乎並排" : "相距 " + gap.toFixed(1) + " 米";
  return name + lead + "，" + horses[second].name + "排第二，" + margin + "。";
}

export function createRaceReport(onReplay, formatTime) {
  const panel = document.getElementById("race-report");
  const title = document.getElementById("report-title");
  const call = document.getElementById("report-call");
  const fullCall = document.getElementById("fullscreen-call");
  const picker = document.getElementById("moment-picker");
  const rail = document.getElementById("report-moments");
  const buttons = checkpoints.map(({ label }, i) => {
    const button = document.createElement("button");
    button.type = "button";
    button.innerHTML = '<span class="moment-label">' + label + icon("play") + '</span><span class="moment-leader"></span><small></small>';
    button.onclick = () => onReplay(i);
    rail.append(button);
    picker.add(new Option(label, String(i)));
    return button;
  });
  picker.onchange = () => onReplay(Number(picker.value));
  let lastPlan, lastKey;
  return (race, t, replay) => {
    panel.hidden = !race.plan;
    if (panel.hidden) {
      fullCall.textContent = "";
      return;
    }
    const moments = raceMoments(race);
    const index = moments.findLastIndex(moment => moment.time <= t);
    const settled = race.phase === "settled";
    const clip = replay?.scope === "moment" ? replay.momentIndex : -1;
    const key = [race.phase, replay?.scope, clip, index, t < 0].join("/");
    if (lastPlan === race.plan && lastKey === key) return;
    lastPlan = race.plan;
    lastKey = key;
    let report = raceCall(moments, index, t);
    if (clip > index) {
      report = checkpoints[clip].label + " · " + horses[moments[clip].leader].name + "跟拍重播";
    } else if (index >= 0) {
      report = checkpoints[index].label + " · " + report;
    }
    title.textContent = replay ? "重播戰報" : settled ? "分段重播" : "分段戰報";
    if (call.textContent !== report) call.textContent = report;
    fullCall.textContent = clip < 0 ? "" : report;
    buttons.forEach((button, i) => {
      const reached = i <= index;
      const moment = moments[i];
      const clock = reached ? formatTime(moment.time) : "—";
      button.disabled = !settled;
      button.dataset.reached = String(reached);
      button.style.setProperty("--marker", reached ? horses[moment.leader].color : "var(--line)");
      button.querySelector(".moment-leader").textContent = reached ? horses[moment.leader].name : "待過點";
      button.lastElementChild.textContent = clock;
      const detail = reached ? "，" + clock + "，" + horses[moment.leader].name + "帶頭" : "";
      button.setAttribute("aria-label", (settled ? "重播" : "") + checkpoints[i].label + detail);
      if (settled) button.setAttribute("aria-pressed", String(i === clip));
      else button.removeAttribute("aria-pressed");
    });
  };
}
