export const horses = [
  {
    number: 1,
    name: "赤焰流星",
    en: "Crimson Comet",
    color: "#ef5148",
    coat: "#a45c35",
    x: -3.9,
    z: 2.8,
  },
  {
    number: 2,
    name: "藍岸疾風",
    en: "Azure Gale",
    color: "#548ae4",
    coat: "#71422e",
    x: 0.2,
    z: -0.8,
  },
  {
    number: 3,
    name: "黃金時刻",
    en: "Golden Hour",
    color: "#e8bf4c",
    coat: "#c78750",
    x: 3.5,
    z: 3.5,
  },
  {
    number: 4,
    name: "翡翠之星",
    en: "Jade Star",
    color: "#57b792",
    coat: "#4d3931",
    x: 5.3,
    z: -2.6,
  },
  {
    number: 5,
    name: "紫夜追影",
    en: "Midnight Echo",
    color: "#ab83d0",
    coat: "#9b9a95",
    x: -1.8,
    z: -4.7,
  },
  {
    number: 6,
    name: "銀河漫步",
    en: "Silver Orbit",
    color: "#b2c6cb",
    coat: "#6f6057",
    x: 1.9,
    z: -6.4,
  },
];
export const cameras = [
  {
    id: "track",
    name: "場邊跟拍",
    en: "TRACKSIDE",
    icon: "camera",
    desc: "近距離側拍馬匹與騎師",
  },
  {
    id: "aerial",
    name: "高空俯視",
    en: "AERIAL",
    icon: "aerial",
    desc: "從上方觀察馬群走位",
  },
  {
    id: "tele",
    name: "直播長鏡",
    en: "TELEPHOTO",
    icon: "broadcast",
    desc: "長焦追蹤馬群的正面動態",
  },
];
export const riderCamera = {
  id: "rider", name: "騎姿近鏡", en: "RIDER CLOSE-UP", icon: "camera",
  desc: "近看騎師雙手如何跟隨馬頸起伏",
};
export const venues = [
  { id: "overview", name: "馬場全景", en: "COURSE OVERVIEW" },
  { id: "gate", name: "起步馬閘", en: "STARTING GATE" },
  { id: "stand", name: "觀眾看台", en: "GRANDSTAND" },
  { id: "finish", name: "終點柱與鏡架", en: "FINISH LINE" },
];
export const duration = 76;
export const laneX = (runner) => -6 + runner * 2;
