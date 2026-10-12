import { describe, expect, it } from 'vitest';
import { AutoQuality } from '../src/game/quality';

/** Feed `seconds` of frames at a constant frame rate; collect every change. */
function run(q: AutoQuality, fps: number, seconds: number) {
  const changes = [];
  for (let t = 0; t < seconds; t += 1 / fps) {
    const c = q.frame(1 / fps);
    if (c) changes.push(c);
  }
  return changes;
}

describe('AutoQuality', () => {
  it('holds steady inside the target band', () => {
    const q = new AutoQuality('medium');
    expect(run(q, 52, 30)).toEqual([]);
    expect(q.preset).toBe('medium');
    expect(q.renderScale).toBe(1);
  });

  it('lowers resolution first, then the preset, when frames drop', () => {
    const q = new AutoQuality('high');
    const changes = run(q, 30, 40);
    expect(changes.length).toBeGreaterThanOrEqual(3);
    expect(changes[0].renderScale).toBeLessThan(1);
    expect(changes[0].preset).toBe('high');
    expect(changes.some((c) => c.preset === 'medium')).toBe(true);
    for (let i = 1; i < changes.length; i++) expect(changes[i].preset === changes[i - 1].preset || changes[i].preset !== 'high').toBe(true);
    // never below the floor
    expect(q.renderScale).toBeGreaterThanOrEqual(0.6);
  });

  it('bottoms out at low quality and minimum resolution without oscillating', () => {
    const q = new AutoQuality('low');
    run(q, 15, 120);
    expect(q.preset).toBe('low');
    expect(q.renderScale).toBe(0.6);
    expect(run(q, 15, 60)).toEqual([]);
  });

  it('climbs slowly when there is headroom and nothing has failed yet', () => {
    const q = new AutoQuality('low');
    const up = run(q, 60, 20);
    expect(up.length).toBe(1); // one rung per ~16 s
    expect(q.preset).toBe('medium');
  });

  it('never climbs back onto a rung that proved too slow (no oscillation at a 60 Hz cap)', () => {
    const q = new AutoQuality('high');
    run(q, 40, 6); // high@1 fails -> high@0.85
    const after = q.renderScale;
    expect(q.preset).toBe('high');
    expect(after).toBeLessThan(1);
    expect(run(q, 60, 120)).toEqual([]); // capped display: plenty of fast windows, still no climb
    expect(q.renderScale).toBe(after);
  });

  it('ignores pauses and background gaps', () => {
    const q = new AutoQuality('medium');
    expect(q.frame(0)).toBeNull();
    expect(q.frame(5)).toBeNull();
    expect(run(q, 58, 10)).toEqual([]);
  });
});
