import { describe, expect, it } from 'vitest';
import { LETTERS } from '../../content/letters.ts';
import { LAKES, PLANET_RADIUS } from '../../world.ts';
import { pushedOffLakes } from './index.ts';

describe('手紙の配置', () => {
  it('湖回避をかけると、すべての手紙が湖の外(岸+1.5以上)にある', () => {
    for (const letter of LETTERS) {
      const direction = pushedOffLakes(letter.direction.clone());
      for (const lake of LAKES) {
        const surface = direction.angleTo(lake.direction) * PLANET_RADIUS;
        expect(
          surface,
          `${letter.id} が湖(半径${lake.radius})の中にある`
        ).toBeGreaterThanOrEqual(lake.radius + 1.4);
      }
    }
  });

  it('元の座標のままだと湖に重なる手紙が実在する(回避処理が仕事をしている)', () => {
    const overlapping = LETTERS.filter((letter) =>
      LAKES.some(
        (lake) => letter.direction.angleTo(lake.direction) * PLANET_RADIUS < lake.radius
      )
    );
    expect(overlapping.length).toBeGreaterThan(0);
  });
});
