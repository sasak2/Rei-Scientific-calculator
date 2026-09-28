/**
 * 수식 편집기 모델: 토큰과 틀(template)의 트리 + 커서.
 *
 * 왜 문자열이 아니라 트리인가?
 *   fx-991ES의 Natural Display(MathIO)에서 분수 키를 누르면 "□/□" 틀이 생기고, 커서가
 *   분자 칸 → 분모 칸으로 이동한다. 이것은 문자열 편집으로는 표현하기 어렵고, 자연스럽게
 *   "칸(Row)을 가진 노드"의 트리가 된다. 처음부터 트리로 두면 LineIO(한 줄 표시)는
 *   같은 트리를 평평하게 그리는 렌더러 하나만 추가하면 된다.
 *
 *   Row  = Item[]          (한 칸. 루트도 하나의 Row)
 *   Item = 토큰 | 틀        (틀은 여러 개의 Row를 가진다: 분수는 [분자, 분모])
 *   Cursor = (칸의 경로, 칸 안에서의 위치)
 *
 * MVP에서는 토큰만 사용하지만, 커서 이동/삭제는 틀까지 고려해 작성해 두었다.
 */
import { TOKENS, type TokenId } from './tokens';

export type TemplateKind = 'frac' | 'sqrt' | 'pow' | 'root' | 'logab';

export type Row = Item[];
export type Item = { t: 'tok'; id: TokenId } | { t: 'tpl'; kind: TemplateKind; slots: Row[] };

/** 루트에서 현재 칸까지의 경로. 각 단계는 [부모 칸에서 틀의 인덱스, 틀 안 칸 번호] */
export type SlotPath = ReadonlyArray<readonly [item: number, slot: number]>;

export interface Cursor {
  path: SlotPath;
  index: number;
}

export interface EditorState {
  root: Row;
  cursor: Cursor;
}

export function emptyEditor(): EditorState {
  return { root: [], cursor: { path: [], index: 0 } };
}

export function isEmpty(ed: EditorState): boolean {
  return ed.root.length === 0;
}

function slotAt(root: Row, path: SlotPath): Row {
  let row = root;
  for (const [i, s] of path) {
    const item = row[i];
    if (item.t !== 'tpl') throw new Error('invalid slot path');
    row = item.slots[s];
  }
  return row;
}

// ---------------------------------------------------------------- 편집 연산
// 편집기는 불변(immutable) 스타일 대신 제자리 수정을 한다. 상태 소유자가 Calculator 하나뿐이라
// 복사 비용을 치를 이유가 없다. 히스토리에 저장할 때만 cloneRow로 복사한다.

export function insert(ed: EditorState, item: Item): void {
  const row = slotAt(ed.root, ed.cursor.path);
  row.splice(ed.cursor.index, 0, item);
  if (item.t === 'tpl') {
    // 틀을 넣으면 첫 번째 칸으로 들어간다 (실기 동작)
    ed.cursor = { path: [...ed.cursor.path, [ed.cursor.index, 0]], index: 0 };
  } else {
    ed.cursor.index++;
  }
}

export function insertToken(ed: EditorState, id: TokenId): void {
  insert(ed, { t: 'tok', id });
}

/** DEL: 커서 왼쪽 항목을 지운다. 칸의 맨 앞이면 틀을 풀어서 내용만 남긴다. */
export function deleteBackward(ed: EditorState): void {
  const { path, index } = ed.cursor;
  const row = slotAt(ed.root, path);
  if (index > 0) {
    row.splice(index - 1, 1);
    ed.cursor.index--;
    return;
  }
  if (path.length === 0) return;
  const [itemIdx] = path[path.length - 1];
  const parentPath = path.slice(0, -1);
  const parent = slotAt(ed.root, parentPath);
  const tpl = parent[itemIdx];
  if (tpl.t !== 'tpl') return;
  const flat = tpl.slots.flat();
  parent.splice(itemIdx, 1, ...flat);
  ed.cursor = { path: parentPath, index: itemIdx };
}

/** ▶: 틀이 있으면 그 안으로 들어가고, 칸 끝이면 다음 칸/부모로 나간다. 루트 끝에서는 맨 앞으로 순환. */
export function moveRight(ed: EditorState): void {
  const { path, index } = ed.cursor;
  const row = slotAt(ed.root, path);
  if (index < row.length) {
    const item = row[index];
    ed.cursor = item.t === 'tpl' ? { path: [...path, [index, 0]], index: 0 } : { path, index: index + 1 };
    return;
  }
  if (path.length === 0) {
    ed.cursor = { path: [], index: 0 };
    return;
  }
  const [itemIdx, slot] = path[path.length - 1];
  const parentPath = path.slice(0, -1);
  const tpl = slotAt(ed.root, parentPath)[itemIdx];
  if (tpl.t === 'tpl' && slot + 1 < tpl.slots.length) {
    ed.cursor = { path: [...parentPath, [itemIdx, slot + 1]], index: 0 };
  } else {
    ed.cursor = { path: parentPath, index: itemIdx + 1 };
  }
}

/** ◀: moveRight의 거울상. */
export function moveLeft(ed: EditorState): void {
  const { path, index } = ed.cursor;
  const row = slotAt(ed.root, path);
  if (index > 0) {
    const item = row[index - 1];
    if (item.t === 'tpl') {
      const last = item.slots.length - 1;
      ed.cursor = { path: [...path, [index - 1, last]], index: item.slots[last].length };
    } else {
      ed.cursor = { path, index: index - 1 };
    }
    return;
  }
  if (path.length === 0) {
    ed.cursor = { path: [], index: row.length };
    return;
  }
  const [itemIdx, slot] = path[path.length - 1];
  const parentPath = path.slice(0, -1);
  if (slot > 0) {
    const tpl = slotAt(ed.root, parentPath)[itemIdx];
    if (tpl.t === 'tpl') {
      ed.cursor = { path: [...parentPath, [itemIdx, slot - 1]], index: tpl.slots[slot - 1].length };
      return;
    }
  }
  ed.cursor = { path: parentPath, index: itemIdx };
}

export function cursorToEnd(ed: EditorState): void {
  ed.cursor = { path: [], index: ed.root.length };
}

export function cursorToStart(ed: EditorState): void {
  ed.cursor = { path: [], index: 0 };
}

export function cloneRow(row: Row): Row {
  return row.map((it) => (it.t === 'tok' ? { ...it } : { ...it, slots: it.slots.map(cloneRow) }));
}

// ---------------------------------------------------------------- 선형 표시
// 디스플레이가 그릴 "셀" 목록. 커서 위치에는 CURSOR 표식이 들어간다.

export const CURSOR = Symbol('cursor');
export type Cell = string | typeof CURSOR;

const TEMPLATE_LINEAR: Record<TemplateKind, { open: string; sep: string[]; close: string }> = {
  frac: { open: '', sep: ['⌟'], close: '' },
  sqrt: { open: '√(', sep: [], close: ')' },
  pow: { open: '^(', sep: [], close: ')' },
  root: { open: '', sep: ['√('], close: ')' },
  logab: { open: 'log(', sep: [','], close: ')' },
};

export function linearCells(ed: EditorState, withCursor = true): Cell[] {
  const out: Cell[] = [];
  const cur = withCursor ? ed.cursor : null;

  const walk = (row: Row, path: SlotPath) => {
    const here = cur && samePath(cur.path, path);
    row.forEach((item, i) => {
      if (here && cur!.index === i) out.push(CURSOR);
      if (item.t === 'tok') {
        out.push(TOKENS[item.id].text);
      } else {
        const fmt = TEMPLATE_LINEAR[item.kind];
        if (fmt.open) out.push(fmt.open);
        item.slots.forEach((slot, s) => {
          if (s > 0) out.push(fmt.sep[s - 1]);
          walk(slot, [...path, [i, s]]);
        });
        if (fmt.close) out.push(fmt.close);
      }
    });
    if (here && cur!.index === row.length) out.push(CURSOR);
  };
  walk(ed.root, []);
  return out;
}

function samePath(a: SlotPath, b: SlotPath): boolean {
  return a.length === b.length && a.every(([i, s], k) => i === b[k][0] && s === b[k][1]);
}
