import { finalGrade, scoreDistribution } from '../score-distribution';

describe('scoreDistribution', () => {
  it('splits 0..maxScore in 5 equal ranges', () => {
    expect(scoreDistribution([0, 0.99, 1, 4.25, 5], 5)).toEqual([
      { from: 0, to: 1, count: 2 },
      { from: 1, to: 2, count: 1 },
      { from: 2, to: 3, count: 0 },
      { from: 3, to: 4, count: 0 },
      { from: 4, to: 5, count: 2 },
    ]);
  });

  it('puts a grade on a boundary in the range that starts there, despite floating point', () => {
    const buckets = scoreDistribution([2.4], 3);
    expect(buckets.map((b) => b.from)).toEqual([0, 0.6, 1.2, 1.8, 2.4]);
    expect(buckets[4].count).toBe(1);
  });

  it('keeps grades out of 0..maxScore in the first or last range', () => {
    const buckets = scoreDistribution([-1, 7], 5);
    expect(buckets[0].count).toBe(1);
    expect(buckets[4].count).toBe(1);
  });

  it('is empty without a grading scale', () => {
    expect(scoreDistribution([3], undefined)).toEqual([]);
  });
});

describe('finalGrade', () => {
  it('averages the jurors grades, rounded', () => {
    const evaluation = (grade: number) => ({ grade, details: [] });
    expect(finalGrade([evaluation(4), evaluation(3.5), evaluation(3)])).toBe(
      3.5,
    );
  });
});
