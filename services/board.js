/**
 * The class board, as the server remembers it.
 *
 * Every phone draws its own copy of the board from the same events, so the
 * server used to be a pure relay: whoever came in late saw a blank board.
 * Now the room keeps the current board (strokes, pinned images and text)
 * and hands it to each arrival in the join ack. A stroke is a list of 0–1
 * points; an item is a text or an image placed in 0–1 coordinates. Images
 * are carried as a URL (uploaded over HTTP first), never as pixels, so a
 * board event stays small. The pointer is never stored: it is a moment.
 */
const MAX_STROKES = 400;
const MAX_ITEMS = 12;
const MAX_TEXT = 140;

function empty() {
    return { strokes: [], items: [] };
}

const num = (v, fallback = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const clamp01 = (v) => Math.max(0, Math.min(1, num(v)));

/** A text or image item, cleaned; null if it is not one. */
function cleanItem(raw, existing) {
    if (!raw || typeof raw !== 'object' || typeof raw.id !== 'string' || raw.id.length > 40) return null;
    const kind = raw.kind || (existing && existing.kind);
    const base = {
        id: raw.id,
        kind,
        by: String(raw.by || (existing && existing.by) || ''),
        x: clamp01(raw.x !== undefined ? raw.x : existing && existing.x),
        y: clamp01(raw.y !== undefined ? raw.y : existing && existing.y),
        locked: raw.locked !== undefined ? !!raw.locked : !!(existing && existing.locked),
    };
    if (kind === 'text') {
        const text = String(raw.text !== undefined ? raw.text : existing && existing.text || '').slice(0, MAX_TEXT);
        if (!text.trim()) return null;
        return {
            ...base, text,
            color: String(raw.color || (existing && existing.color) || '#fff').slice(0, 24),
            size: Math.max(0.02, Math.min(0.2, num(raw.size, existing ? existing.size : 0.05))),
        };
    }
    if (kind === 'image') {
        const src = typeof raw.src === 'string' ? raw.src : existing && existing.src;
        // A URL, not pixels. A data URL here would be a megabyte in every join ack.
        if (!src || !/^https?:\/\//.test(src) || src.length > 600) return null;
        return {
            ...base, src,
            w: Math.max(0.05, Math.min(1, num(raw.w, existing ? existing.w : 0.5))),
            ar: Math.max(0.1, Math.min(10, num(raw.ar, existing ? existing.ar : 1))),
        };
    }
    return null;
}

/**
 * Apply one annotate event to a board. Returns the board to keep, or null
 * if the event is not one the board records (the pointer) or is malformed.
 * The board object is replaced, never mutated, so a half-applied event
 * cannot leave it torn.
 */
function apply(board, ev) {
    const b = board && Array.isArray(board.strokes) && Array.isArray(board.items) ? board : empty();
    if (!ev || typeof ev !== 'object') return null;
    switch (ev.op) {
        case 'stroke': {
            const s = ev.stroke;
            if (!s || typeof s.id !== 'string' || !Array.isArray(s.points) || s.points.length === 0 || s.points.length > 2000) return null;
            const stroke = {
                id: s.id.slice(0, 40), by: String(s.by || ''), color: String(s.color || '#fff').slice(0, 24),
                width: Math.max(1, Math.min(40, num(s.width, 4))),
                points: s.points.slice(0, 2000).map((p) => ({ x: clamp01(p && p.x), y: clamp01(p && p.y) })),
            };
            const strokes = b.strokes.filter((x) => x.id !== stroke.id).concat(stroke).slice(-MAX_STROKES);
            return { ...b, strokes };
        }
        case 'erase':
            if (typeof ev.id !== 'string') return null;
            return { ...b, strokes: b.strokes.filter((x) => x.id !== ev.id) };
        case 'clear':
            return ev.items ? empty() : { ...b, strokes: [] };
        case 'item': {
            const existing = b.items.find((x) => x.id === (ev.item && ev.item.id));
            const item = cleanItem(ev.item, existing);
            if (!item) return null;
            if (!existing && b.items.length >= MAX_ITEMS) return null;
            const items = existing ? b.items.map((x) => (x.id === item.id ? item : x)) : b.items.concat(item);
            return { ...b, items };
        }
        case 'place': {
            // A move, resize, lock or edit of an item already on the board.
            const existing = b.items.find((x) => x.id === ev.id);
            if (!existing) return null;
            const item = cleanItem({ ...ev, kind: existing.kind }, existing);
            if (!item) return null;
            return { ...b, items: b.items.map((x) => (x.id === item.id ? item : x)) };
        }
        case 'remove':
            if (typeof ev.id !== 'string') return null;
            return { ...b, items: b.items.filter((x) => x.id !== ev.id) };
        default:
            return null;
    }
}

module.exports = { empty, apply, MAX_ITEMS, MAX_STROKES, MAX_TEXT };
