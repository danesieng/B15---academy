import React, { useRef, useState } from 'react';
import {
  ArrowLeft,
  Box,
  CheckCircle2,
  Clock,
  FileCheck2,
  FileText,
  Lock,
  Play,
  Upload,
} from 'lucide-react';
import {
  ActivitySubmission,
  EpisodeData,
  LessonProgress,
} from '../types/course';
import { VideoBriefingStage } from './VideoBriefingStage';
import { Quiz3DViewer } from './Quiz3DViewer';

interface EpisodeViewProps {
  episode: EpisodeData;
  progress: LessonProgress;
  studentName: string;
  submissions: ActivitySubmission[];
  onBackToMap: () => void;
  onCompleteVideo: (episodeId: string) => void;
  onQuestionCorrect: (episodeId: string, questionId: string) => void;
  onSubmitActivity: (submission: Omit<ActivitySubmission, 'id' | 'submittedAt' | 'status'>) => void;
}

type StageTab = 'video' | 'quiz' | 'activity';

export const EpisodeView: React.FC<EpisodeViewProps> = ({
  episode,
  progress,
  studentName,
  submissions,
  onBackToMap,
  onCompleteVideo,
  onQuestionCorrect,
  onSubmitActivity,
}) => {
  const [stage, setStage] = useState<StageTab>('video');
  const [notes, setNotes] = useState('');
  const [selectedFile, setSelectedFile] = useState<{
    name: string;
    type: string;
    dataUrl: string;
  } | null>(null);
  const [uploadError, setUploadError] = useState('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const videoCompleted = Boolean(progress?.videoConcluido);
  const quizCompleted = Boolean(progress?.quizConcluido);
  const episodeSubmissions = submissions.filter((s) => s.episodeId === episode.id);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError('');

    if (file.size > 2.5 * 1024 * 1024) {
      setUploadError('Arquivo muito grande para armazenamento local (máx. 2.5 MB).');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      setSelectedFile({
        name: file.name,
        type: file.type || 'application/octet-stream',
        dataUrl: result,
      });
    };
    reader.readAsDataURL(file);
  };

  const handleSubmitPractice = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) {
      setUploadError('Selecione uma imagem (PNG/JPG) ou PDF do seu Shop Drawing.');
      return;
    }

    onSubmitActivity({
      episodeId: episode.id,
      episodeTitle: episode.titulo,
      studentName: studentName || 'Aluno VDC',
      fileName: selectedFile.name,
      fileType: selectedFile.type,
      fileDataUrl: selectedFile.dataUrl,
      notes: notes.trim(),
    });

    setSelectedFile(null);
    setNotes('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <main className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6 lg:py-8">
      {/* Top Episode Header & 3-Stage Stepper */}
      <div className="mb-6 flex flex-col gap-4 border-b-2 border-[#4C172D] pb-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-start gap-4">
          <button
            type="button"
            onClick={onBackToMap}
            className="mt-0.5 flex items-center gap-1.5 rounded-sm border-2 border-[#6E1D3B] bg-[#160B14] px-3 py-2 text-xs font-bold text-rose-100 hover:bg-[#2A1121] transition-colors cursor-pointer shrink-0"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Mapa</span>
          </button>

          <div>
            <div className="flex items-center gap-2 text-xs text-rose-300 font-medium">
              <span>{episode.ilhaNome}</span>
              <span className="text-rose-500/60" aria-hidden="true">·</span>
              <span>Formato Pós-Episódio</span>
            </div>
            <h1 className="mt-1 font-display text-2xl sm:text-3xl font-bold text-white">
              {episode.titulo}
            </h1>
          </div>
        </div>

        {/* 3-Step Stage Selector */}
        <div className="flex flex-wrap items-center gap-1.5 rounded-sm border-2 border-[#4C172D] bg-[#160B14] p-1.5 shrink-0">
          <button
            type="button"
            onClick={() => setStage('video')}
            className={`flex items-center gap-2 rounded-sm px-3.5 py-2 text-xs font-bold transition-colors cursor-pointer whitespace-nowrap ${
              stage === 'video'
                ? 'bg-[#9F1239] text-yellow-300 border border-yellow-400/70'
                : 'text-rose-100/80 hover:text-white border border-transparent'
            }`}
          >
            {videoCompleted ? (
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
            ) : (
              <Play className="h-3.5 w-3.5" />
            )}
            <span>Etapa A · Vídeo</span>
          </button>

          <button
            type="button"
            disabled={!videoCompleted}
            onClick={() => videoCompleted && setStage('quiz')}
            className={`flex items-center gap-2 rounded-sm px-3.5 py-2 text-xs font-bold transition-colors whitespace-nowrap ${
              !videoCompleted
                ? 'text-rose-300/35 cursor-not-allowed border border-transparent'
                : stage === 'quiz'
                ? 'bg-cyan-400 text-[#0B060B] border border-cyan-200 cursor-pointer'
                : 'text-rose-100/80 hover:text-white border border-transparent cursor-pointer'
            }`}
          >
            {!videoCompleted ? (
              <Lock className="h-3.5 w-3.5" />
            ) : quizCompleted ? (
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
            ) : (
              <Box className="h-3.5 w-3.5" />
            )}
            <span>Etapa B · Quiz 3D</span>
          </button>

          <button
            type="button"
            onClick={() => setStage('activity')}
            className={`flex items-center gap-2 rounded-sm px-3.5 py-2 text-xs font-bold transition-colors cursor-pointer whitespace-nowrap ${
              stage === 'activity'
                ? 'bg-[#9F1239] text-yellow-300 border border-yellow-400/70'
                : 'text-rose-100/80 hover:text-white border border-transparent'
            }`}
          >
            <FileCheck2 className="h-3.5 w-3.5" />
            <span>
              Etapa C · Prática {episode.atividadePratica.ativa ? '' : '(Opcional)'}
            </span>
          </button>
        </div>
      </div>

      {/* Stage Content */}
      {stage === 'video' && (
        <VideoBriefingStage
          episode={episode}
          isCompleted={videoCompleted}
          onVideoCompleted={() => onCompleteVideo(episode.id)}
          onGoToQuiz={() => setStage('quiz')}
        />
      )}

      {stage === 'quiz' && (
        <Quiz3DViewer
          episode={episode}
          answeredCorrectIds={progress?.questoesAcertadas ?? []}
          onQuestionCorrect={(qId) => onQuestionCorrect(episode.id, qId)}
          onGoToActivity={() => setStage('activity')}
        />
      )}

      {stage === 'activity' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Submission Form */}
          <form
            onSubmit={handleSubmitPractice}
            className="lg:col-span-7 hibit-panel rounded-lg p-5 sm:p-6 space-y-5"
          >
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="font-bold text-yellow-300">
                Etapa C · Entrega de Shop Drawing
              </span>
              <span className="text-rose-200/75">
                Aprovação do instrutor vale +150 XP
              </span>
            </div>

            <div>
              <h2 className="font-display text-xl font-bold text-white">
                {episode.atividadePratica.titulo}
              </h2>
              <p className="mt-2 text-sm text-rose-100/85 leading-relaxed">
                {episode.atividadePratica.instrucoes}
              </p>
              <div className="mt-2 text-xs text-rose-200/70">
                Entregável esperado: {episode.atividadePratica.entregavel}
              </div>
            </div>

            {/* File Dropzone */}
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,.pdf"
                onChange={handleFileChange}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex w-full flex-col items-center justify-center gap-2 rounded-sm border-2 border-dashed border-[#6E1D3B] bg-[#0B060B] px-6 py-8 text-center hover:border-yellow-400 transition-colors cursor-pointer"
              >
                <Upload className="h-7 w-7 text-yellow-400" />
                <span className="text-sm font-semibold text-white">
                  {selectedFile
                    ? selectedFile.name
                    : 'Clique para enviar imagem (PNG/JPG) ou PDF'}
                </span>
                <span className="text-xs text-rose-200/70">
                  O arquivo será enviado para revisão no Painel do Instrutor
                </span>
              </button>

              {selectedFile && selectedFile.type.startsWith('image/') && (
                <div className="mt-3 overflow-hidden rounded-sm border-2 border-[#4C172D] bg-[#0B060B] p-2">
                  <img
                    src={selectedFile.dataUrl}
                    alt="Pré-visualização do exercício"
                    referrerPolicy="no-referrer"
                    className="max-h-56 w-full object-contain"
                  />
                </div>
              )}
            </div>

            <div>
              <label
                htmlFor="practice-notes"
                className="block text-xs font-bold text-rose-200 mb-2"
              >
                Observações Técnicas para o Instrutor (opcional)
              </label>
              <textarea
                id="practice-notes"
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Ex: Cota BOP adotada em 2,15m conforme viga do eixo B..."
                className="w-full rounded-sm border-2 border-[#4C172D] bg-[#0B060B] p-3 text-sm text-white placeholder-rose-300/40 focus:border-yellow-400 focus:outline-none"
              />
            </div>

            {uploadError && (
              <div className="rounded-sm border-2 border-rose-500/60 bg-rose-950/35 px-3.5 py-2.5 text-xs text-rose-300">
                {uploadError}
              </div>
            )}

            <button
              type="submit"
              className="hibit-btn-gold w-full sm:w-auto rounded-sm px-6 py-3 text-xs font-bold transition-colors cursor-pointer"
            >
              Enviar Atividade para Correção
            </button>
          </form>

          {/* Student Submission History for This Episode */}
          <aside className="lg:col-span-5 hibit-panel rounded-lg p-5 sm:p-6">
            <h3 className="font-display text-lg font-bold text-white">
              Suas Entregas neste Episódio
            </h3>
            <p className="mt-1 text-xs text-rose-200/75">
              Acompanhe o status ou acesse a aba &ldquo;Painel do Instrutor&rdquo; para validar entregas e liberar +150 XP.
            </p>

            {episodeSubmissions.length === 0 ? (
              <div className="mt-6 rounded-sm border border-[#4C172D] bg-[#0B060B] p-6 text-center text-xs text-rose-200/70">
                Nenhuma entrega enviada ainda para {episode.titulo}.
              </div>
            ) : (
              <div className="mt-5 space-y-3">
                {episodeSubmissions.map((sub) => {
                  const approved = sub.status === 'Aprovada';
                  return (
                    <div
                      key={sub.id}
                      className="rounded-sm border-2 border-[#4C172D] bg-[#0B060B] p-4"
                    >
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="flex items-center gap-1.5 font-medium text-white truncate">
                          <FileText className="h-3.5 w-3.5 text-cyan-400 shrink-0" />
                          <span className="truncate">{sub.fileName}</span>
                        </span>
                        {approved ? (
                          <span className="flex items-center gap-1 font-semibold text-emerald-400 shrink-0">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            <span>Aprovada (+150 XP)</span>
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 font-semibold text-yellow-400 shrink-0">
                            <Clock className="h-3.5 w-3.5" />
                            <span>Aguardando Correção</span>
                          </span>
                        )}
                      </div>
                      {sub.notes && (
                        <p className="mt-2 text-xs text-slate-400">{sub.notes}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </aside>
        </div>
      )}
    </main>
  );
};
