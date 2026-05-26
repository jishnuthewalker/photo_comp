/** Returns BPM from tap timestamps (ms), using median of last 8 intervals. */
export function tapTempoMedian(timestamps: number[]): number | null {
  if (timestamps.length < 2) return null;
  const sorted = [...timestamps].sort((a, b) => a - b);
  const recent = sorted.slice(-9); // up to 9 taps = 8 intervals
  const intervals: number[] = [];
  for (let i = 1; i < recent.length; i++) {
    const interval = recent[i] - recent[i - 1];
    if (interval > 0) intervals.push(interval); // skip duplicate timestamps
  }
  if (intervals.length === 0) return null;
  intervals.sort((a, b) => a - b);
  const mid = Math.floor(intervals.length / 2);
  const median =
    intervals.length % 2 === 0
      ? (intervals[mid - 1] + intervals[mid]) / 2
      : intervals[mid];
  return 60000 / median;
}
