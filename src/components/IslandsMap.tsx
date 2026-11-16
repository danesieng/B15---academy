import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Box,
  CheckCircle2,
  Compass,
  Cpu,
  FileCheck2,
  Layers,
  Play,
  RotateCcw,
  ShieldAlert,
  Wrench,
} from 'lucide-react';
import { AvatarConfig, EpisodeData, LessonProgress } from '../types/course';
import { ISLANDS, calculateLevelInfo } from '../utils/gamification';
import {
  OverworldMapSceneController,
  StageHoverProjection,
} from '../three/OverworldMapScene';
import { AvatarMiniSvg } from './TopGamificationBar';

interface IslandsMapProps {
  episodes: EpisodeData[];
  lessonsProgress: Record<string, LessonProgress>;
  avatar: AvatarConfig;
  xp: number;
  onSelectEpisode: (episodeId: string) => void;
}

const ISLAND_ICONS: Record<string, React.ReactNode> = {
  'ilha-0': <Compass className="h-4 w-4" />,
  'ilha-1': <Cpu className="h-4 w-4" />,
  'ilha-2': <Layers className="h-4 w-4" />,
  'ilha-3': <Wrench className="h-4 w-4" />,
  'ilha-4': <ShieldAlert className="h-4 w-4" />,
};

export const IslandsMap: React.FC<IslandsMapProps> = ({
  episodes,
  lessonsProgress,
  avatar,
  xp,
  onSelectEpisode,
}) => {
  const [selectedIslandId, setSelectedIslandId] = useState<string>('all');

  const episodeMap = useMemo(() => {
    const map = new Map<string, EpisodeData>();
    episodes.forEach((ep) => map.set(ep.id, ep));
    return map;
  }, [episodes]);

  const nextRecommended = useMemo(() => {
    return (
      episodes.find((ep) => {
        const p = lessonsProgress[ep.id];
        return !p?.videoConcluido || !p?.quizConcluido;
      }) ?? episodes[0]
    );
  }, [episodes, lessonsProgress]);

  const [focusedEpisodeId, setFocusedEpisodeId] = useState<string>(
    nextRecommended?.id ?? '1.0'
  );
  const [stageProjection, setStageProjection] =
    useState<StageHoverProjection | null>(null);

  const mountRef = useRef<HTMLDivElement | null>(null);
  const overworldRef = useRef<OverworldMapSceneController | null>(null);
  const onSelectEpisodeRef = useRef(onSelectEpisode);
  onSelectEpisodeRef.current = onSelectEpisode;

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const ctrl = new OverworldMapSceneController(container, {
      episodes,
      lessonsProgress,
      avatarConfig: avatar,
      initialEpisodeId: focusedEpisodeId,
      onSelectStage: (episodeId, openDirectly) => {
        setFocusedEpisodeId(episodeId);
        if (openDirectly) {
          onSelectEpisodeRef.current(episodeId);
        }
      },
      onProjectionUpdate: (proj) => setStageProjection(proj),
    });
    overworldRef.current = ctrl;

    return () => {
      ctrl.dispose();
      overworldRef.current = null;
    };
    // Mount once; avatar & focus updates are handled cleanly via methods
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    overworldRef.current?.updateAvatarConfig(avatar);
  }, [avatar]);

  const stats = useMemo(() => {
    let completedCount = 0;
    let videoCount = 0;
    let quizCount = 0;
    episodes.forEach((ep) => {
      const p = lessonsProgress[ep.id];
      if (p?.videoConcluido) videoCount++;
      if (p?.quizConcluido) quizCount++;
      if (p?.videoConcluido && p?.quizConcluido) completedCount++;
    });
    return {
      total: episodes.length,
      completedCount,
      videoCount,
      quizCount,
      percent: episodes.length
        ? Math.round((completedCount / episodes.length) * 100)
        : 0,
    };
  }, [episodes, lessonsProgress]);

  const levelInfo = calculateLevelInfo(xp);
  const focusedEpisode = episodeMap.get(focusedEpisodeId) ?? nextRecommended;

  const visibleIslands = useMemo(() => {
    if (selectedIslandId === 'all') return ISLANDS;
    return ISLANDS.filter((isl) => isl.id === selectedIslandId);
  }, [selectedIslandId]);

  const handleFocusIsland = (islandId: string) => {
    setSelectedIslandId(islandId);
    overworldRef.current?.focusIsland(islandId);
  };

  const handleMoveToStage = (episodeId: string) => {
    setFocusedEpisodeId(episodeId);
    overworldRef.current?.moveAvatarToStage(episodeId, true);
  };

  return (
    <main className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6 lg:py-7">
      {/* Top 3D Overworld Stage (Mario World 2 Style Archipelago) */}
      <section className="hibit-panel rounded-lg overflow-hidden">
        {/* Header Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b-2 border-[#4C172D] bg-[#1B0D18] px-5 py-3.5">
          <div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-rose-300 font-medium">
              <span>B15 - Academy</span>
              <span className="text-rose-500/70" aria-hidden="true">·</span>
              <span>Mapa Overworld 3D</span>
              <span className="text-rose-500/70" aria-hidden="true">·</span>
              <span>Trilha HI-Bit BIM/VDC Electrical</span>
            </div>
            <h1 className="mt-0.5 font-display text-2xl sm:text-3xl font-bold text-white">
              Arquipélago das Ilhas — Rota de Fases
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => handleFocusIsland('all')}
              className={`flex items-center gap-1.5 rounded-sm border-2 px-3 py-1.5 text-xs font-bold transition-colors cursor-pointer whitespace-nowrap ${
                selectedIslandId === 'all'
                  ? 'border-yellow-300 bg-[#881337] text-yellow-300'
                  : 'border-[#4C172D] bg-[#120910] text-rose-100 hover:border-rose-400'
              }`}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>Visão Geral (5 Ilhas)</span>
            </button>

            {ISLANDS.map((isl) => {
              const active = selectedIslandId === isl.id;
              return (
                <button
                  key={isl.id}
                  type="button"
                  onClick={() => handleFocusIsland(isl.id)}
                  className={`flex items-center gap-1.5 rounded-sm border-2 px-3 py-1.5 text-xs font-bold transition-colors cursor-pointer whitespace-nowrap ${
                    active
                      ? 'border-yellow-300 bg-[#9F1239] text-yellow-300'
                      : 'border-[#4C172D] bg-[#120910] text-rose-100/85 hover:border-rose-400'
                  }`}
                >
                  <span>Ilha {isl.numero}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 3D Interactive Canvas */}
        <div className="relative h-[430px] sm:h-[490px] w-full bg-[#0B060B]">
          <div ref={mountRef} className="h-full w-full" />

          {/* Floating 3D-Projected Stage Tooltip */}
          {stageProjection?.visible && (
            <div
              className="pointer-events-none absolute -translate-x-1/2 -translate-y-full rounded border-2 border-yellow-400 bg-[#160B14]/95 px-3 py-1.5 shadow-[3px_3px_0_0_#000] whitespace-nowrap"
              style={{
                left: `${stageProjection.x}px`,
                top: `${stageProjection.y}px`,
              }}
            >
              <div className="flex items-center gap-2 text-[11px] text-rose-300">
                <span>{stageProjection.ilhaNome}</span>
                {stageProjection.completed && (
                  <span className="text-emerald-400 font-bold">· Concluída</span>
                )}
              </div>
              <div className="font-display text-sm font-bold text-yellow-300">
                {stageProjection.titulo}
              </div>
            </div>
          )}

          {/* Subtle Top-Left Controls Legend */}
          <div className="pointer-events-none absolute left-3.5 top-3.5 rounded border border-[#6E1D3B] bg-[#120910]/90 px-3 py-1.5 text-[11px] text-rose-200/85">
            Clique em uma fase no 3D para mover seu Avatar · Clique novamente para entrar
          </div>
        </div>

        {/* Active Stage Action Bar + KPI Strip */}
        <div className="border-t-2 border-[#4C172D] bg-[#140A12] px-5 py-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            {focusedEpisode && (
              <div className="flex items-center gap-3.5 min-w-0">
                <AvatarMiniSvg avatar={avatar} size={44} />
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-xs text-rose-300">
                    <span className="font-mono-data text-yellow-400 font-bold">
                      FASE SELECIONADA
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>{focusedEpisode.ilhaNome}</span>
                  </div>
                  <div className="font-display text-xl font-bold text-white truncate">
                    {focusedEpisode.titulo}
                  </div>
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-6 shrink-0">
              <div className="hidden sm:flex items-center gap-5 text-xs">
                <div>
                  <span className="text-rose-300/70">Progresso: </span>
                  <span className="font-mono-data font-bold text-white">
                    {stats.completedCount}/{stats.total} ({stats.percent}%)
                  </span>
                </div>
                <div>
                  <span className="text-rose-300/70">Patente: </span>
                  <span className="font-display font-bold text-yellow-300">
                    Nível {levelInfo.level} · {levelInfo.title}
                  </span>
                </div>
              </div>

              {focusedEpisode && (
                <button
                  type="button"
                  onClick={() => onSelectEpisode(focusedEpisode.id)}
                  className="hibit-btn-gold flex items-center gap-2 rounded-sm px-5 py-2.5 text-sm font-bold transition-transform active:translate-y-0.5 cursor-pointer whitespace-nowrap"
                >
                  <Play className="h-4 w-4 fill-current" />
                  <span>Entrar na Fase</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Mario World 2 Dotted Stage Trails per Island */}
      <div className="mt-7 space-y-6">
        {visibleIslands.map((island) => {
          const islandEpisodes = island.episodioIds
            .map((id) => episodeMap.get(id))
            .filter((ep): ep is EpisodeData => Boolean(ep));

          const doneInIsland = islandEpisodes.filter((ep) => {
            const p = lessonsProgress[ep.id];
            return p?.videoConcluido && p?.quizConcluido;
          }).length;

          return (
            <section
              key={island.id}
              className="hibit-panel rounded-lg p-5 sm:p-6"
            >
              <div className="flex flex-wrap items-center justify-between gap-4 border-b-2 border-[#3D1325] pb-4">
                <div className="flex items-center gap-3.5">
                  <span
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-sm border-2 border-white/20 text-[#0B060B] shadow-[2px_2px_0_0_#000]"
                    style={{ backgroundColor: island.corAcento }}
                  >
                    {ISLAND_ICONS[island.id]}
                  </span>
                  <div>
                    <div className="text-xs text-rose-300 font-medium">
                      Ilha {island.numero} · {doneInIsland}/{islandEpisodes.length} concluídas
                    </div>
                    <h2 className="font-display text-xl font-bold text-white">
                      {island.nome}
                    </h2>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <p className="hidden md:block text-xs text-rose-200/75 max-w-md">
                    {island.subtitulo}
                  </p>
                  <button
                    type="button"
                    onClick={() => handleFocusIsland(island.id)}
                    className="rounded-sm border border-[#6E1D3B] bg-[#1F0D1A] px-3 py-1.5 text-xs font-semibold text-yellow-300 hover:bg-[#331328] cursor-pointer whitespace-nowrap"
                  >
                    Focar no 3D
                  </button>
                </div>
              </div>

              {/* Dotted Stage Trail (Mario World 2 Stage Nodes + Avatar Badge + Dotted Connector) */}
              <div className="mt-5 flex flex-wrap items-stretch gap-y-4">
                {islandEpisodes.map((ep, idx) => {
                  const prog = lessonsProgress[ep.id];
                  const videoDone = Boolean(prog?.videoConcluido);
                  const quizDone = Boolean(prog?.quizConcluido);
                  const fullyDone = videoDone && quizDone;
                  const isFocused = ep.id === focusedEpisodeId;

                  return (
                    <React.Fragment key={ep.id}>
                      <div className="w-full sm:w-[calc(50%-12px)] lg:w-[calc(25%-18px)] flex flex-col">
                        <div
                          className={`flex flex-1 flex-col justify-between rounded border-2 p-4 transition-colors ${
                            isFocused
                              ? 'border-yellow-400 bg-[#250F1E] shadow-[3px_3px_0_0_#000]'
                              : fullyDone
                              ? 'border-emerald-500/60 bg-[#0F1E1A]'
                              : 'border-[#4C172D] bg-[#11080F] hover:border-rose-400'
                          }`}
                        >
                          <div>
                            {/* Stage Header with Avatar Representation */}
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <AvatarMiniSvg avatar={avatar} size={26} />
                                <span className="font-mono-data text-[11px] font-bold text-rose-200">
                                  Fase {ep.codigo}
                                </span>
                              </div>
                              {fullyDone ? (
                                <span className="flex items-center gap-1 text-[11px] font-bold text-emerald-400">
                                  <CheckCircle2 className="h-3.5 w-3.5" />
                                  <span>OK</span>
                                </span>
                              ) : isFocused ? (
                                <span className="text-[11px] font-bold text-yellow-300">
                                  Avatar Aqui
                                </span>
                              ) : null}
                            </div>

                            <h3 className="mt-2.5 font-display text-base font-bold text-white">
                              {ep.titulo}
                            </h3>
                            <p className="mt-1 text-xs text-rose-100/70 line-clamp-2 leading-relaxed">
                              {ep.videoResumo}
                            </p>
                          </div>

                          <div className="mt-4 space-y-3 border-t border-[#3D1325] pt-3">
                            {/* Stage checklist */}
                            <div className="flex items-center gap-2.5 text-[11px]">
                              <span
                                className={`flex items-center gap-1 ${
                                  videoDone ? 'text-emerald-400' : 'text-rose-300/70'
                                }`}
                              >
                                <Play className="h-3 w-3" />
                                <span>Vídeo</span>
                              </span>
                              <span className="text-rose-500/40" aria-hidden="true">·</span>
                              <span
                                className={`flex items-center gap-1 ${
                                  quizDone ? 'text-emerald-400' : 'text-rose-300/70'
                                }`}
                              >
                                <Box className="h-3 w-3" />
                                <span>Quiz 3D</span>
                              </span>
                              {ep.atividadePratica.ativa && (
                                <>
                                  <span className="text-rose-500/40" aria-hidden="true">·</span>
                                  <span className="flex items-center gap-1 text-cyan-300">
                                    <FileCheck2 className="h-3 w-3" />
                                    <span>Prática</span>
                                  </span>
                                </>
                              )}
                            </div>

                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => onSelectEpisode(ep.id)}
                                className="flex-1 rounded-sm border border-yellow-400/70 bg-[#881337] px-2.5 py-1.5 text-xs font-bold text-yellow-300 hover:bg-[#9F1239] transition-colors cursor-pointer"
                              >
                                Abrir Fase
                              </button>
                              <button
                                type="button"
                                onClick={() => handleMoveToStage(ep.id)}
                                className="rounded-sm border border-[#4C172D] bg-[#1A0D16] px-2.5 py-1.5 text-[11px] font-semibold text-rose-200 hover:border-yellow-400/60 hover:text-white transition-colors cursor-pointer"
                                title="Mover Avatar no Mapa 3D"
                              >
                                Ir no 3D
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Dotted Path Connector between consecutive stages */}
                      {idx < islandEpisodes.length - 1 && (
                        <div
                          className="hidden lg:flex w-6 items-center justify-center shrink-0"
                          aria-hidden="true"
                        >
                          <div className="w-full border-t-4 border-dotted border-yellow-400/65" />
                        </div>
                      )}
                      {idx < islandEpisodes.length - 1 && (
                        <div
                          className="hidden sm:flex lg:hidden w-6 items-center justify-center shrink-0"
                          aria-hidden="true"
                        >
                          <div className="w-full border-t-4 border-dotted border-yellow-400/65" />
                        </div>
                      )}
                    </React.Fragment>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </main>
  );
};
