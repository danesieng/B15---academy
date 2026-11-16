export type AppTab = 'map' | 'avatar' | 'instructor';

export type GlassesStyle = 'none' | 'clear' | 'amber' | 'tinted' | 'cyan_visor';

export interface AvatarConfig {
  name: string;
  helmetColor: string;
  skinColor: string;
  vestColor: string;
  glassesStyle: GlassesStyle;
}

export interface QuizAlternative {
  id: string;
  texto: string;
  correta: boolean;
  objeto_alvo: string;
  camera_foco: [number, number, number];
  alvo_lookat: [number, number, number];
  rotulo: string;
  feedback: string;
}

export interface QuizQuestion {
  id: string;
  enunciado: string;
  contexto_normativo: string;
  alternativas: QuizAlternative[];
}

export interface PracticalActivity {
  ativa: boolean;
  titulo: string;
  instrucoes: string;
  entregavel: string;
}

export interface EpisodeData {
  id: string;
  codigo: string;
  titulo: string;
  ilhaId: string;
  ilhaNome: string;
  duracaoSegundos: number;
  videoResumo: string;
  videoTopicos: string[];
  quiz: QuizQuestion[];
  atividadePratica: PracticalActivity;
}

export interface IslandDefinition {
  id: string;
  numero: number;
  nome: string;
  subtitulo: string;
  corAcento: string;
  episodioIds: string[];
}

export interface LessonProgress {
  videoConcluido: boolean;
  quizConcluido: boolean;
  questoesAcertadas: string[];
}

export type SubmissionStatus = 'Aguardando Correção' | 'Aprovada';

export interface ActivitySubmission {
  id: string;
  episodeId: string;
  episodeTitle: string;
  studentName: string;
  fileName: string;
  fileType: string;
  fileDataUrl: string;
  notes: string;
  submittedAt: string;
  status: SubmissionStatus;
}

export interface StudentProgressState {
  xp: number;
  avatar: AvatarConfig;
  lessons: Record<string, LessonProgress>;
  submissions: ActivitySubmission[];
}

export interface XpNotification {
  id: string;
  amount: number;
  reason: string;
  leveledUp: boolean;
  newLevel: number;
}
