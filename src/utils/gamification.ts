import { StudentProgressState, IslandDefinition } from '../types/course';

export const STORAGE_KEY = 'voltbim_academy_progress_v1';

export const XP_REWARDS = {
  VIDEO_COMPLETED: 50,
  QUIZ_CORRECT: 100,
  ACTIVITY_APPROVED: 150,
} as const;

export const LEVEL_THRESHOLDS = [
  0,     // Nível 1: Aprendiz de Campo
  150,   // Nível 2: Modelador Jr.
  350,   // Nível 3: Especialista EMT
  650,   // Nível 4: Coordenador BIM
  1050,  // Nível 5: Engenheiro VDC
  1550,  // Nível 6: Líder de Shop Drawings
  2200,  // Nível 7: Mestre Elétrico VDC
  3000,  // Nível 8: Arquiteto BIM Sênior
];

export const LEVEL_TITLES = [
  'Aprendiz de Campo',
  'Modelador Jr.',
  'Especialista EMT',
  'Coordenador BIM',
  'Engenheiro VDC',
  'Líder de Shop Drawings',
  'Mestre Elétrico VDC',
  'Arquiteto BIM Sênior',
];

export function calculateLevelInfo(xp: number) {
  let level = 1;
  for (let i = 0; i < LEVEL_THRESHOLDS.length; i++) {
    if (xp >= LEVEL_THRESHOLDS[i]) {
      level = i + 1;
    } else {
      break;
    }
  }

  const currentFloor = LEVEL_THRESHOLDS[level - 1] ?? 0;
  const nextThreshold = LEVEL_THRESHOLDS[level] ?? currentFloor + 1000;
  const xpInLevel = xp - currentFloor;
  const xpForNext = nextThreshold - currentFloor;
  const progressPercent = Math.min(100, Math.max(0, Math.round((xpInLevel / xpForNext) * 100)));
  const title = LEVEL_TITLES[level - 1] ?? `Especialista Nível ${level}`;

  return {
    level,
    title,
    currentFloor,
    nextThreshold,
    xpInLevel,
    xpForNext,
    progressPercent,
  };
}

export const DEFAULT_PROGRESS: StudentProgressState = {
  xp: 0,
  avatar: {
    name: 'Eng. Lucas Silva',
    helmetColor: '#FACC15',
    skinColor: '#E0AC69',
    vestColor: '#EA580C',
    glassesStyle: 'cyan_visor',
  },
  lessons: {},
  submissions: [],
};

export function loadProgress(): StudentProgressState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PROGRESS;
    const parsed = JSON.parse(raw) as Partial<StudentProgressState>;
    return {
      xp: typeof parsed.xp === 'number' ? parsed.xp : 0,
      avatar: {
        ...DEFAULT_PROGRESS.avatar,
        ...(parsed.avatar ?? {}),
      },
      lessons: parsed.lessons ?? {},
      submissions: Array.isArray(parsed.submissions) ? parsed.submissions : [],
    };
  } catch {
    return DEFAULT_PROGRESS;
  }
}

export function saveProgress(state: StudentProgressState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage quota errors safely
  }
}

export const ISLANDS: IslandDefinition[] = [
  {
    id: 'ilha-0',
    numero: 0,
    nome: 'Base Camp',
    subtitulo: 'Fundamentos da Jornada BIM/VDC & Fluxo Pós-Episódio',
    corAcento: '#FACC15',
    episodioIds: ['1.0'],
  },
  {
    id: 'ilha-1',
    numero: 1,
    nome: 'Conceitos Elétricos',
    subtitulo: 'Painéis, Transformadores, Circuitos e Dimensionamento NEC',
    corAcento: '#22D3EE',
    episodioIds: [
      '2.1', '2.2', '2.3', '2.4', '2.5', '2.6', '2.7',
      '2.8', '2.9', '2.10', '2.11', '2.12', '2.13',
    ],
  },
  {
    id: 'ilha-2',
    numero: 2,
    nome: 'Revit & Families',
    subtitulo: 'Interface MEP, Parâmetros de Sistema e Famílias Carregáveis',
    corAcento: '#38BDF8',
    episodioIds: ['3.1', '3.2', '3.3', '3.4', '3.5', '3.6', '3.7', '4.1', '4.2'],
  },
  {
    id: 'ilha-3',
    numero: 3,
    nome: 'Modelagem Construtiva',
    subtitulo: 'Sala Elétrica, Suportação, Eletrodutos e Pranchas Executivas',
    corAcento: '#F59E0B',
    episodioIds: ['5.1', '5.2', '5.3', '5.4', '5.5', '5.6', '5.7', '5.8'],
  },
  {
    id: 'ilha-4',
    numero: 4,
    nome: 'Coordenação',
    subtitulo: 'Acessibilidade, Manutenção, Prioridade de Disciplinas e Clash',
    corAcento: '#10B981',
    episodioIds: ['6.1', '6.2', '6.3', '6.4'],
  },
];
