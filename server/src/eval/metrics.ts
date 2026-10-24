// Statistics helpers for the evaluation harness. No external dependencies.

export function mean(xs: number[]): number | null {
  if (xs.length === 0) return null;
  return xs.reduce((s, x) => s + x, 0) / xs.length;
}

export function pearson(xs: number[], ys: number[]): number | null {
  if (xs.length < 2 || xs.length !== ys.length) return null;
  const mx = mean(xs)!;
  const my = mean(ys)!;
  let num = 0;
  let dx2 = 0;
  let dy2 = 0;
  for (let i = 0; i < xs.length; i++) {
    const dx = xs[i] - mx;
    const dy = ys[i] - my;
    num += dx * dy;
    dx2 += dx * dx;
    dy2 += dy * dy;
  }
  if (dx2 === 0 || dy2 === 0) return null;
  return num / Math.sqrt(dx2 * dy2);
}

function rank(xs: number[]): number[] {
  const order = xs.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
  const ranks = new Array<number>(xs.length);
  for (let i = 0; i < order.length; i++) {
    let j = i;
    while (j + 1 < order.length && order[j + 1].v === order[i].v) j++;
    const avg = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) ranks[order[k].i] = avg;
    i = j;
  }
  return ranks;
}

export function spearman(xs: number[], ys: number[]): number | null {
  if (xs.length < 2 || xs.length !== ys.length) return null;
  return pearson(rank(xs), rank(ys));
}

// Cohen's kappa (unweighted) between two raters over categorical labels.
export function cohenKappa(a: string[], b: string[]): number | null {
  if (a.length < 2 || a.length !== b.length) return null;
  const labels = [...new Set([...a, ...b])];
  const idx = new Map(labels.map((l, i) => [l, i]));
  const k = labels.length;
  const C = Array.from({ length: k }, () => new Array<number>(k).fill(0));
  for (let i = 0; i < a.length; i++) C[idx.get(a[i])!][idx.get(b[i])!]++;
  const n = a.length;
  let po = 0;
  for (let i = 0; i < k; i++) po += C[i][i];
  po /= n;
  let pe = 0;
  for (let i = 0; i < k; i++) {
    const row = C[i].reduce((s, x) => s + x, 0);
    const col = C.reduce((s, r) => s + r[i], 0);
    pe += (row / n) * (col / n);
  }
  if (1 - pe === 0) return null;
  return (po - pe) / (1 - pe);
}

// Adjusted Rand Index between two cluster labelings.
export function adjustedRandIndex(trueLabels: string[], predLabels: string[]): number | null {
  const n = trueLabels.length;
  if (n < 2 || n !== predLabels.length) return null;
  const tVals = [...new Set(trueLabels)];
  const pVals = [...new Set(predLabels)];
  const C = Array.from({ length: tVals.length }, () => new Array<number>(pVals.length).fill(0));
  const tIdx = new Map(tVals.map((v, i) => [v, i]));
  const pIdx = new Map(pVals.map((v, i) => [v, i]));
  for (let i = 0; i < n; i++) C[tIdx.get(trueLabels[i])!][pIdx.get(predLabels[i])!]++;
  const comb = (x: number) => (x * (x - 1)) / 2;
  let sumComb = 0;
  const tSums = new Array<number>(tVals.length).fill(0);
  const pSums = new Array<number>(pVals.length).fill(0);
  for (let i = 0; i < tVals.length; i++) {
    for (let j = 0; j < pVals.length; j++) {
      sumComb += comb(C[i][j]);
      tSums[i] += C[i][j];
      pSums[j] += C[i][j];
    }
  }
  const tComb = tSums.reduce((s, x) => s + comb(x), 0);
  const pComb = pSums.reduce((s, x) => s + comb(x), 0);
  const totalComb = comb(n);
  const expected = totalComb ? (tComb * pComb) / totalComb : 0;
  const maxIndex = (tComb + pComb) / 2;
  const denom = maxIndex - expected;
  if (denom === 0) return 0;
  return (sumComb - expected) / denom;
}

// Fowlkes-Mallows index between two cluster labelings.
export function fowlkesMallows(trueLabels: string[], predLabels: string[]): number | null {
  const n = trueLabels.length;
  if (n < 2 || n !== predLabels.length) return null;
  let tp = 0;
  let fp = 0;
  let fn = 0;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const sameTrue = trueLabels[i] === trueLabels[j];
      const samePred = predLabels[i] === predLabels[j];
      if (sameTrue && samePred) tp++;
      else if (!sameTrue && samePred) fp++;
      else if (sameTrue && !samePred) fn++;
    }
  }
  if (tp + fp === 0 || tp + fn === 0) return null;
  return Math.sqrt((tp / (tp + fp)) * (tp / (tp + fn)));
}
