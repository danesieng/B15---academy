import React, { useEffect, useRef, useState } from 'react';
import { CheckCircle2, FastForward, Pause, Play, Upload } from 'lucide-react';
import { EpisodeData } from '../types/course';

interface VideoBriefingStageProps {
  episode: EpisodeData;
  isCompleted: boolean;
  onVideoCompleted: () => void;
  onGoToQuiz: () => void;
}

export const VideoBriefingStage: React.FC<VideoBriefingStageProps> = ({
  episode,
  isCompleted,
  onVideoCompleted,
  onGoToQuiz,
}) => {
  const [localVideoUrl, setLocalVideoUrl] = useState<string | null>(null);
  const [localFileName, setLocalFileName] = useState<string>('');
  const [isPlayingBriefing, setIsPlayingBriefing] = useState<boolean>(false);
  const [elapsedSec, setElapsedSec] = useState<number>(0);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const duration = Math.max(45, Math.min(90, episode.duracaoSegundos || 60));

  useEffect(() => {
    setLocalVideoUrl(null);
    setLocalFileName('');
    setIsPlayingBriefing(false);
    setElapsedSec(0);
  }, [episode.id]);

  useEffect(() => {
    return () => {
      if (localVideoUrl) {
        URL.revokeObjectURL(localVideoUrl);
      }
    };
  }, [localVideoUrl]);

  // Built-in deterministic briefing timer when no local MP4 is loaded
  useEffect(() => {
    if (localVideoUrl || !isPlayingBriefing) return;

    const timer = window.setInterval(() => {
      setElapsedSec((prev) => {
        const next = prev + 1;
        if (next >= duration) {
          setIsPlayingBriefing(false);
          onVideoCompleted();
          return duration;
        }
        return next;
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [localVideoUrl, isPlayingBriefing, duration, onVideoCompleted]);

  const handleLoadLocalMp4 = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (localVideoUrl) URL.revokeObjectURL(localVideoUrl);
    const url = URL.createObjectURL(file);
    setLocalVideoUrl(url);
    setLocalFileName(file.name);
    setIsPlayingBriefing(false);
  };

  const handleQuickComplete = () => {
    setIsPlayingBriefing(false);
    setElapsedSec(duration);
    onVideoCompleted();
    onGoToQuiz();
  };

  const progressPct = Math.min(100, Math.round((elapsedSec / duration) * 100));
  const currentTopicIndex = Math.min(
    episode.videoTopicos.length - 1,
    Math.floor((elapsedSec / duration) * episode.videoTopicos.length)
  );

  const formatTime = (s: number) => {
    const mins = Math.floor(s / 60);
    const secs = Math.floor(s % 60);
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 items-stretch">
      {/* Left/Main Video Player Container */}
      <div className="lg:col-span-8 flex flex-col hibit-panel rounded-lg overflow-hidden">
        <div className="relative aspect-video w-full bg-[#090409] flex items-center justify-center">
          {localVideoUrl ? (
            <video
              ref={videoRef}
              src={localVideoUrl}
              controls
              autoPlay
              onEnded={onVideoCompleted}
              className="h-full w-full bg-black object-contain"
            />
          ) : (
            <div className="relative flex h-full w-full flex-col justify-between p-6 sm:p-8 bg-gradient-to-br from-[#1C0B16] via-[#0F060D] to-[#270E1E]">
              {/* Top Briefing Header */}
              <div className="flex items-center justify-between gap-4">
                <div className="text-xs font-mono-data text-yellow-300 font-bold">
                  EPISÓDIO {episode.codigo} · BRIEFING TÉCNICO ({duration}s)
                </div>
                <div className="font-mono-data text-xs text-rose-200">
                  {formatTime(elapsedSec)} / {formatTime(duration)}
                </div>
              </div>

              {/* Center Visual Stage */}
              <div className="my-auto py-4">
                <h2 className="font-display text-2xl sm:text-3xl font-bold text-white max-w-xl">
                  {episode.titulo}
                </h2>
                <p className="mt-3 text-sm sm:text-base text-rose-100/85 max-w-2xl leading-relaxed">
                  {episode.videoResumo}
                </p>

                <div className="mt-6 rounded-sm border-2 border-[#6E1D3B] bg-[#140A12] p-4 max-w-2xl">
                  <div className="text-[11px] font-bold text-yellow-300">
                    Tópico em foco ({currentTopicIndex + 1}/{episode.videoTopicos.length})
                  </div>
                  <div className="mt-1 text-sm font-medium text-white">
                    {episode.videoTopicos[currentTopicIndex]}
                  </div>
                </div>
              </div>

              {/* Bottom Player Controls */}
              <div className="space-y-3">
                <div
                  className="h-2.5 w-full cursor-pointer overflow-hidden rounded-sm border border-[#6E1D3B] bg-[#0B060B]"
                  onClick={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                    setElapsedSec(Math.round(ratio * duration));
                  }}
                >
                  <div
                    className="h-full bg-gradient-to-r from-rose-500 via-amber-400 to-yellow-300 transition-all duration-200"
                    style={{ width: `${progressPct}%` }}
                  />
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => setIsPlayingBriefing((prev) => !prev)}
                    className="hibit-btn-gold flex items-center gap-2 rounded-sm px-4 py-2 text-xs font-bold transition-colors cursor-pointer"
                  >
                    {isPlayingBriefing ? (
                      <>
                        <Pause className="h-3.5 w-3.5 fill-current" />
                        <span>Pausar Briefing</span>
                      </>
                    ) : (
                      <>
                        <Play className="h-3.5 w-3.5 fill-current" />
                        <span>{elapsedSec > 0 ? 'Retomar Briefing' : 'Reproduzir Briefing'}</span>
                      </>
                    )}
                  </button>

                  <span className="text-xs text-rose-200/75">
                    Simulador HTML5 ativo · Carregue seu MP4 local abaixo se desejar
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Bottom Discreet Tools Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t-2 border-[#4C172D] bg-[#140A12] px-4 py-3">
          <div className="flex items-center gap-3">
            <input
              ref={fileInputRef}
              type="file"
              accept="video/mp4,video/*"
              onChange={handleLoadLocalMp4}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2 rounded-sm border border-[#6E1D3B] bg-[#1E0E1A] px-3 py-1.5 text-xs font-semibold text-rose-100 hover:border-yellow-400 hover:text-white transition-colors cursor-pointer"
            >
              <Upload className="h-3.5 w-3.5 text-yellow-400" />
              <span>Carregar MP4 local para teste</span>
            </button>
            {localFileName && (
              <span className="text-xs text-yellow-300 truncate max-w-[200px]">
                {localFileName}
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={handleQuickComplete}
            className="flex items-center gap-2 rounded-sm border-2 border-yellow-400/70 bg-[#881337] px-3.5 py-1.5 text-xs font-bold text-yellow-300 hover:bg-[#9F1239] transition-colors cursor-pointer"
          >
            <FastForward className="h-3.5 w-3.5" />
            <span>Avançar/Concluir Vídeo (+50 XP)</span>
          </button>
        </div>
      </div>

      {/* Right Summary & Checklist Panel */}
      <aside className="lg:col-span-4 flex flex-col justify-between hibit-panel rounded-lg p-5 sm:p-6">
        <div>
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="font-bold text-yellow-400">Etapa A · Conceito Chave</span>
            {isCompleted ? (
              <span className="flex items-center gap-1 font-bold text-emerald-400">
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span>+50 XP creditado</span>
              </span>
            ) : (
              <span className="text-rose-200/75">Vale +50 XP</span>
            )}
          </div>

          <h3 className="mt-2 font-display text-lg font-bold text-white">
            Pontos-Chave para o Quiz 3D
          </h3>
          <p className="mt-2 text-xs text-rose-100/80 leading-relaxed">
            {episode.videoResumo}
          </p>

          <ul className="mt-5 space-y-3 border-t-2 border-[#3D1325] pt-4">
            {episode.videoTopicos.map((topic, i) => (
              <li key={i} className="flex items-start gap-2.5 text-xs text-rose-50 leading-relaxed">
                <span className="font-mono-data text-yellow-400 font-bold shrink-0">
                  0{i + 1}.
                </span>
                <span>{topic}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-6 border-t-2 border-[#3D1325] pt-4">
          {isCompleted ? (
            <button
              type="button"
              onClick={onGoToQuiz}
              className="hibit-btn-gold w-full rounded-sm px-4 py-2.5 text-xs font-bold transition-colors cursor-pointer"
            >
              Ir para Etapa B: Quiz 3D Dinâmico
            </button>
          ) : (
            <p className="text-xs text-rose-200/75">
              Assista ao vídeo até o final (ou clique em &ldquo;Avançar/Concluir Vídeo&rdquo;) para liberar a inspeção 3D e ganhar +50 XP.
            </p>
          )}
        </div>
      </aside>
    </div>
  );
};
