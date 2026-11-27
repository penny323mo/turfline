import { bendEntry, bendExit, LENGTH } from "./course.js";
import { horses } from "./data.js";
import { markets, snapshotAt, twoRunnerMarket } from "./race.js";
import { chaseRival } from "./broadcast.js";

const name = runner => horses[runner].name;

const calls = [
  leader => "開閘！" + leader + "喺前面搶位。",
  leader => "入彎，" + leader + "帶住馬群。",
  leader => "轉入直路，" + leader + "帶頭。",
  leader => "最後二百米！" + leader + "暫時領先。",
  (leader, second, gap) => "最後一百米！" + leader + (gap <= 2.5
    ? "同" + second + "爭先！" : "領先" + second + " " + gap.toFixed(1) + " 米。"),
  leader => leader + "率先衝線！",
];

function chaseStatus(race, frame, runner) {
  const rank = frame.order.indexOf(runner);
  if (frame.ds[runner] >= LENGTH) return "第 " + (rank + 1) + " 名衝線";
  const rival = chaseRival(frame.order, rank);
  const gap = Math.abs(frame.ds[runner] - frame.ds[rival]);
  const prefix = "第 " + (rank + 1) + " 位";
  const margin = gap < 0.1 ? "同" + name(rival) + "並排"
    : (rank === 0 ? "領先" : "落後") + name(rival) + " " + gap.toFixed(1) + " 米";
  const before = snapshotAt(race, frame.t - 2);
  const oldRank = before.order.indexOf(runner);
  const oldGap = Math.abs(before.ds[runner] - before.ds[rival]);
  const adjacent = oldRank === rank && chaseRival(before.order, oldRank) === rival;
  let trend = "";
  if (frame.t >= 2 && adjacent && Math.abs(gap - oldGap) >= 0.8) {
    if (rank === 0) trend = gap > oldGap ? " · 拉開緊" : " · 次名追近";
    else trend = gap < oldGap ? " · 追近緊" : " · 差距拉開";
  }
  return prefix + " · " + margin + trend;
}

export function createLiveCommentary(onFollow) {
  const panel = document.getElementById("live-story");
  const caption = document.getElementById("live-caption");
  const chase = document.getElementById("live-chase");
  const follow = document.getElementById("follow-ticket");
  const sound = document.getElementById("commentary");
  const speech = window.speechSynthesis;
  let watchedPair;
  let voice, raceNumber, section, leader, contender, contenderSince, wasReplay = false, lastSpoken = -Infinity;
  follow.onclick = () => onFollow(Number(follow.dataset.runner), watchedPair);
  function findVoice() {
    return speech?.getVoices().find(candidate =>
      candidate.localService && /^(yue(?:-|$)|zh[-_]HK(?:-|$))/i.test(candidate.lang));
  }
  sound.onclick = () => {
    if (voice) {
      speech.cancel();
      voice = undefined;
    } else {
      voice = findVoice();
      if (!voice) {
        sound.textContent = "報馬未可用";
        sound.setAttribute("aria-label", "此裝置暫無廣東話聲線");
        return;
      }
    }
    sound.textContent = voice ? "報馬 開" : "報馬 關";
    sound.setAttribute("aria-pressed", String(!!voice));
    sound.removeAttribute("aria-label");
    if (voice && !panel.hidden && caption.textContent && section < calls.length - 1) speak(caption.textContent);
  };
  function cancelSpeech() {
    if (voice) speech.cancel();
  }
  document.addEventListener("visibilitychange", () => { if (document.hidden) cancelSpeech(); });
  window.addEventListener("pagehide", cancelSpeech);
  function speak(message) {
    const line = new SpeechSynthesisUtterance(message);
    line.voice = voice;
    line.lang = voice.lang;
    line.rate = 1.12;
    speech.speak(line);
    lastSpoken = performance.now();
  }
  function announce(message, important) {
    caption.textContent = message;
    if (!voice || document.hidden || (!important && (speech.speaking || performance.now() - lastSpoken < 3400))) return;
    if (important) speech.cancel();
    speak(message);
  }
  return (race, frame, runner, replay, ticket) => {
    panel.hidden = replay || !frame || frame.t < 0;
    if (replay && !wasReplay) cancelSpeech();
    wasReplay = replay;
    if (panel.hidden) return;
    if (raceNumber !== race.number) {
      raceNumber = race.number;
      section = undefined;
      contender = undefined;
    }
    const d = frame.remaining;
    const currentSection = d === 0 ? 5 : d <= 100 ? 4 : d <= 200 ? 3 : d <= LENGTH - bendExit ? 2 : d <= LENGTH - bendEntry ? 1 : 0;
    const first = frame.order[0];
    if (section !== currentSection) {
      section = currentSection;
      leader = first;
      contender = undefined;
      const second = frame.order[1];
      const message = calls[currentSection](name(first), name(second), frame.ds[first] - frame.ds[second]);
      if (race.phase === "running") announce(message, currentSection >= 3);
      else caption.textContent = message;
    } else if (race.phase === "running" && d > 0) {
      if (first === leader) contender = undefined;
      else if (contender !== first) {
        contender = first;
        contenderSince = frame.t;
      } else if (frame.t - contenderSince >= 0.75) {
        announce(name(first) + "越過" + name(leader) + "，升上首位！", false);
        leader = first;
      }
    }
    let update;
    if (ticket) {
      const ranks = ticket.picks.map(i => frame.order.indexOf(i) + 1);
      const positions = ticket.picks.map((i, k) => horses[i].number + " 號第 " + ranks[k] + " 位");
      let state = "";
      if (ranks.every(rank => rank <= 2)) {
        state = ticket.market === "exacta" ? (ranks[0] === 1 ? " · 次序吻合" : " · 次序相反") : " · 兩駒暫入前二";
      }
      update = markets[ticket.market] + " · " + positions.join(" ／ ") + state;
    } else update = chaseStatus(race, frame, runner);
    if (chase.textContent !== update) chase.textContent = update;
    const latest = race.tickets.at(-1);
    const pick = race.latePick?.runner ?? latest?.picks[0];
    watchedPair = !race.latePick && twoRunnerMarket(latest?.market) ? latest : undefined;
    follow.hidden = pick == null || (pick === runner && ticket?.id === watchedPair?.id);
    if (!follow.hidden) {
      follow.dataset.runner = pick;
      follow.textContent = watchedPair ? "跟拍" + markets[watchedPair.market] + "兩駒" : "跟拍 " + name(pick);
    }
  };
}
