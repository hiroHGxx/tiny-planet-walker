import { describe, expect, it } from 'vitest';
import { EventBus } from './events.ts';

describe('イベントバス', () => {
  it('発火すると購読者が呼ばれ、解除すると呼ばれなくなる', () => {
    const bus = new EventBus();
    const received: string[] = [];
    const off = bus.on('item-picked', ({ item }) => received.push(item));
    bus.emit('item-picked', { item: 'roundleaf' });
    off();
    bus.emit('item-picked', { item: 'starflower' });
    expect(received).toEqual(['roundleaf']);
  });

  it('購読者がいないイベントを発火しても何も起きない', () => {
    const bus = new EventBus();
    expect(() => bus.emit('day-passed', { day: 2 })).not.toThrow();
  });
});
