const board = require('../services/board');

describe('the class board', () => {
    const img = { id: 'i1', kind: 'image', by: 'a', src: 'https://cdn.example/x.jpg', x: 0.2, y: 0.2, w: 0.5, ar: 1.5 };
    test('keeps strokes, clamped to the board, and drops the pointer', () => {
        const b = board.apply(null, { op: 'stroke', stroke: { id: 's1', by: 'a', color: '#f00', width: 4, points: [{ x: 0.1, y: 0.2 }, { x: 2, y: -1 }] } });
        expect(b.strokes[0].points).toEqual([{ x: 0.1, y: 0.2 }, { x: 1, y: 0 }]);
        expect(board.apply(b, { op: 'pointer', x: 0.5, y: 0.5, on: true })).toBeNull();
    });
    test('pins pictures by URL only, and text that says something', () => {
        let b = board.apply(null, { op: 'item', item: img });
        expect(b.items).toHaveLength(1);
        expect(board.apply(b, { op: 'item', item: { ...img, id: 'i2', src: 'data:image/jpeg;base64,AAAA' } })).toBeNull();
        expect(board.apply(b, { op: 'item', item: { id: 't0', kind: 'text', by: 'a', text: '   ', x: 0.1, y: 0.1 } })).toBeNull();
        b = board.apply(b, { op: 'item', item: { id: 't1', kind: 'text', by: 'a', text: 'Hook goes here', color: '#0ff', size: 0.06, x: 0.3, y: 0.4 } });
        expect(b.items.map((i) => i.id)).toEqual(['i1', 't1']);
    });
    test('places, locks, removes, and clears marks or everything', () => {
        let b = board.apply(null, { op: 'item', item: img });
        b = board.apply(b, { op: 'place', id: 'i1', x: 0.6, locked: true });
        expect(b.items[0]).toMatchObject({ x: 0.6, y: 0.2, locked: true, src: img.src });
        expect(board.apply(b, { op: 'place', id: 'nope', x: 0.1 })).toBeNull();
        b = board.apply(b, { op: 'stroke', stroke: { id: 's1', points: [{ x: 0.5, y: 0.5 }] } });
        expect(board.apply(b, { op: 'clear' })).toEqual({ strokes: [], items: b.items });
        expect(board.apply(b, { op: 'clear', items: true })).toEqual({ strokes: [], items: [] });
        expect(board.apply(b, { op: 'remove', id: 'i1' }).items).toEqual([]);
    });
    test('has a ceiling on items', () => {
        let b = board.empty();
        for (let i = 0; i < board.MAX_ITEMS; i++) b = board.apply(b, { op: 'item', item: { ...img, id: `i${i}` } });
        expect(board.apply(b, { op: 'item', item: { ...img, id: 'one-too-many' } })).toBeNull();
    });
});
