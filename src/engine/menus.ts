/**
 * 실기의 번호 선택 메뉴 (MODE, SETUP, hyp, DRG▶, CLR …).
 * 메뉴가 열려 있으면 숫자 키가 항목 선택이 되고, ▲▼로 페이지를 넘기며 AC로 닫는다.
 */
export type MenuId = 'mode' | 'setup' | 'fix' | 'sci' | 'norm' | 'hyp' | 'drg' | 'clr' | 'clrConfirm';

export interface MenuDef {
  /** 항목 대신 한 줄 질문을 보여 주는 메뉴 (Fix 0~9? 등) */
  prompt?: string;
  pages: string[][];
}

export const MENUS: Record<MenuId, MenuDef> = {
  mode: { pages: [['1:COMP', '2:CMPLX', '3:STAT', '4:BASE-N', '5:EQN', '6:MATRIX', '7:TABLE', '8:VECTOR']] },
  setup: {
    pages: [
      ['1:MthIO', '2:LineIO', '3:Deg', '4:Rad', '5:Gra', '6:Fix', '7:Sci', '8:Norm'],
      ['1:ab/c', '2:d/c', '3:CMPLX', '4:STAT', '5:TABLE', '6:◀CONT▶'],
    ],
  },
  fix: { prompt: 'Fix 0~9?', pages: [[]] },
  sci: { prompt: 'Sci 1~0?', pages: [[]] },
  norm: { prompt: 'Norm 1~2?', pages: [[]] },
  hyp: { pages: [['1:sinh', '2:cosh', '3:tanh', '4:sinh⁻¹', '5:cosh⁻¹', '6:tanh⁻¹']] },
  drg: { pages: [['1:°', '2:r', '3:g']] },
  clr: { prompt: 'CLR', pages: [['1:Setup', '2:Memory', '3:All']] },
  clrConfirm: { pages: [['[=] :Yes', '[AC]:Cancel']] },
};

export interface MenuState {
  id: MenuId;
  page: number;
  /** clrConfirm 등에서 쓰는 부가 정보 */
  arg?: string;
}
