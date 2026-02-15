export function roundToNearest5(weight: number): number {
  return Math.round(weight / 5) * 5;
}

export function calculateTM(tested1rm: number, tmPercentage: number): number {
  return roundToNearest5(tested1rm * (tmPercentage / 100));
}

export function calculateWeight(trainingMax: number, percentage: number): number {
  return roundToNearest5(trainingMax * (percentage / 100));
}

export function calculateE1RM(weight: number, reps: number): number {
  return Math.round(weight * reps * 0.0333 + weight);
}
