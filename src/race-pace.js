const profiles = {
  even: {
    name: "均速",
    hint: "前段步速平均，留意跑位同賠率。",
    bias: 0,
    weight: [1, 1, 1, 1, 1, 1],
    early: [0, 0, 0, 0, 0, 0],
    surge: [0, 0, 0, 0, 0, 0],
  },
  fast: {
    name: "快步速",
    hint: "前段搶放較急，3 號同 5 號留力後追。",
    bias: 0.052,
    weight: [0.72, 0.97, 1.38, 0.86, 1.43, 1.13],
    early: [0.013, 0.007, -0.012, 0.014, -0.013, -0.004],
    surge: [-0.012, -0.004, 0.019, -0.009, 0.022, 0.006],
  },
  slow: {
    name: "慢步速",
    hint: "前段較慢，1 號同 4 號有機會控制步速、搶先發力。",
    bias: -0.041,
    weight: [1.25, 1.05, 0.77, 1.42, 0.70, 0.94],
    early: [0.008, 0.002, 0.003, 0.011, 0.004, 0],
    surge: [0.016, 0.003, -0.011, 0.019, -0.011, 0],
  },
};

const rotation = ["even", "fast", "slow", "fast", "even", "slow"];
export const paceForRace = (round, day) => rotation[(round - 1 + day - 1) % rotation.length];
export const racePace = race => profiles[race.pace] ?? profiles.even;
