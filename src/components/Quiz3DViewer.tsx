import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  Check,
  CheckCircle2,
  Code2,
  Copy,
  Crosshair,
  FolderUp,
  RotateCcw,
  XCircle,
} from 'lucide-react';
import { EpisodeData, QuizAlternative } from '../types/course';
import {
  ElectricalRoomSceneController,
  FloatingLabelProjection,
  InspectorReadout,
} from '../three/ElectricalRoomScene';

interface Quiz3DViewerProps {
  episode: EpisodeData;
  answeredCorrectIds: string[];
  onQuestionCorrect: (questionId: string) => void;
  onGoToActivity: () => void;
}

export const Quiz3DViewer: React.FC<Quiz3DViewerProps> = ({
  episode,
  answeredCorrectIds,
  onQuestionCorrect,
  onGoToActivity,
}) => {
  const [questionIndex, setQuestionIndex] = useState(0);
  const [selectedAlt, setSelectedAlt] = useState<QuizAlternative | null>(null);
  const [inspectorMode, setInspectorMode] = useState(false);
  const [modelSource, setModelSource] = useState('Sala Elétrica BIM (Procedural)');
  const [glbError, setGlbError] = useState('');
  const [copiedJson, setCopiedJson] = useState(false);

  const [floatingLabel, setFloatingLabel] = useState<FloatingLabelProjection>({
    visible: false,
    x: 0,
    y: 0,
    text: '',
    mode: 'none',
  });

  const [inspectorReadout, setInspectorReadout] = useState<InspectorReadout>({
    meshName: 'Clique em qualquer peça 3D',
    cameraPos: [2.8, 2.35, 3.0],
    targetPos: [-0.3, 1.55, -0.6],
  });

  const mountRef = useRef<HTMLDivElement | null>(null);
  const sceneCtrlRef = useRef<ElectricalRoomSceneController | null>(null);
  const glbInputRef = useRef<HTMLInputElement | null>(null);

  const question = episode.quiz[questionIndex] ?? episode.quiz[0];
  const isLastQuestion = questionIndex >= episode.quiz.length - 1;
  const allQuestionsDone = episode.quiz.every((q) => answeredCorrectIds.includes(q.id));

  // Reset question state when switching episode
  useEffect(() => {
    setQuestionIndex(0);
    setSelectedAlt(null);
    sceneCtrlRef.current?.resetView();
  }, [episode.id]);

  // Mount Three.js scene once per Quiz3DViewer mount
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const ctrl = new ElectricalRoomSceneController(container, {
      onLabelUpdate: (label) => setFloatingLabel(label),
      onInspectorUpdate: (readout) => setInspectorReadout(readout),
      onModelSourceChange: (src) => setModelSource(src),
    });
    sceneCtrlRef.current = ctrl;

    return () => {
      ctrl.dispose();
      sceneCtrlRef.current = null;
    };
  }, []);

  useEffect(() => {
    sceneCtrlRef.current?.setInspectorMode(inspectorMode);
  }, [inspectorMode]);

  const handleSelectAlternative = (alt: QuizAlternative) => {
    setSelectedAlt(alt);
    if (inspectorMode) {
      setInspectorMode(false);
    }

    sceneCtrlRef.current?.focusOnTarget(
      alt.camera_foco,
      alt.alvo_lookat,
      alt.objeto_alvo,
      alt.correta ? 'correct' : 'wrong',
      alt.rotulo
    );

    if (alt.correta && question) {
      onQuestionCorrect(question.id);
    }
  };

  const handleNextQuestion = () => {
    if (!isLastQuestion) {
      setQuestionIndex((prev) => prev + 1);
      setSelectedAlt(null);
      sceneCtrlRef.current?.resetView();
    } else {
      onGoToActivity();
    }
  };

  const handleLoadGlb = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !sceneCtrlRef.current) return;
    setGlbError('');
    try {
      await sceneCtrlRef.current.loadGlbFromFile(file);
    } catch {
      setGlbError('Arquivo .glb inválido ou corrompido.');
    }
  };

  const handleCopyInspectorJson = async () => {
    const snippet = {
      texto: 'Descrição da alternativa',
      correta: true,
      objeto_alvo: inspectorReadout.meshName,
      camera_foco: inspectorReadout.cameraPos,
      alvo_lookat: inspectorReadout.targetPos,
      rotulo: inspectorReadout.meshName,
      feedback: 'Explicação técnica aqui.',
    };
    const jsonText = JSON.stringify(snippet, null, 2);
    try {
      await navigator.clipboard.writeText(jsonText);
      setCopiedJson(true);
      window.setTimeout(() => setCopiedJson(false), 2000);
    } catch {
      // Fallback textarea copy
      const ta = document.createElement('textarea');
      ta.value = jsonText;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopiedJson(true);
      window.setTimeout(() => setCopiedJson(false), 2000);
    }
  };

  if (!question) {
    return (
      <div className="rounded-xl border border-white/10 bg-[#111827] p-8 text-center text-sm text-slate-300">
        Nenhuma questão 3D configurada para este episódio.
      </div>
    );
  }

  const isQuestionCorrect = answeredCorrectIds.includes(question.id);

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 items-stretch">
      {/* Left Panel: Question & Alternatives */}
      <div className="lg:col-span-5 flex flex-col justify-between hibit-panel rounded-lg p-5 sm:p-6">
        <div>
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="font-mono-data font-bold text-yellow-300">
              Questão {questionIndex + 1} de {episode.quiz.length}
            </span>
            <span className="text-rose-200/75">{question.contexto_normativo}</span>
          </div>

          <h2 className="mt-3 font-display text-lg sm:text-xl font-bold text-white leading-snug">
            {question.enunciado}
          </h2>

          <p className="mt-2 text-xs text-rose-200/75">
            Selecione uma alternativa para movimentar a câmera 3D e inspecionar o elemento correspondente.
          </p>

          {/* Alternatives */}
          <div className="mt-5 space-y-2.5">
            {question.alternativas.map((alt, idx) => {
              const isSelected = selectedAlt?.id === alt.id;
              const letter = String.fromCharCode(65 + idx);
              let borderStyle = 'border-[#4C172D] bg-[#0B060B] hover:border-rose-400';
              if (isSelected) {
                borderStyle = alt.correta
                  ? 'border-emerald-400 bg-emerald-500/15'
                  : 'border-rose-500 bg-rose-500/15';
              }

              return (
                <button
                  key={alt.id}
                  type="button"
                  onClick={() => handleSelectAlternative(alt)}
                  className={`flex w-full items-start gap-3 rounded-sm border-2 p-3.5 text-left transition-colors cursor-pointer ${borderStyle}`}
                >
                  <span
                    className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-sm font-mono-data text-xs font-bold ${
                      isSelected
                        ? alt.correta
                          ? 'bg-emerald-400 text-[#0B060B]'
                          : 'bg-rose-500 text-white'
                        : 'bg-[#2A1121] text-yellow-300'
                    }`}
                  >
                    {letter}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-white leading-snug">
                      {alt.texto}
                    </div>
                    <div className="mt-1 font-mono-data text-[11px] text-rose-200/65">
                      Alvo 3D: {alt.objeto_alvo}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Technical Feedback Box */}
          {selectedAlt && (
            <div
              className={`mt-5 rounded-sm border-2 p-4 ${
                selectedAlt.correta
                  ? 'border-emerald-500/60 bg-emerald-950/35'
                  : 'border-rose-500/60 bg-rose-950/35'
              }`}
            >
              <div className="flex items-center gap-2 text-xs font-bold">
                {selectedAlt.correta ? (
                  <>
                    <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                    <span className="text-emerald-300">
                      Resposta Correta {isQuestionCorrect ? '· +100 XP garantido' : ''}
                    </span>
                  </>
                ) : (
                  <>
                    <XCircle className="h-4 w-4 text-rose-400" />
                    <span className="text-rose-300">
                      Elemento Incorreto — Observe o destaque em vermelho no 3D
                    </span>
                  </>
                )}
              </div>
              <p className="mt-2 text-xs text-rose-50 leading-relaxed">
                {selectedAlt.feedback}
              </p>
            </div>
          )}
        </div>

        {/* Footer Progression */}
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t-2 border-[#3D1325] pt-4">
          <div className="text-xs text-rose-200/75">
            {allQuestionsDone
              ? 'Quiz 3D concluído!'
              : 'Acerte a questão para liberar +100 XP'}
          </div>

          {(selectedAlt?.correta || isQuestionCorrect) && (
            <button
              type="button"
              onClick={handleNextQuestion}
              className="hibit-btn-gold flex items-center gap-2 rounded-sm px-4 py-2 text-xs font-bold transition-colors cursor-pointer"
            >
              <span>
                {!isLastQuestion
                  ? 'Próxima Questão'
                  : episode.atividadePratica.ativa
                  ? 'Avançar para Etapa C (Prática)'
                  : 'Ir para Atividade Opcional'}
              </span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Right Panel: Three.js 3D Viewer & Inspector Mode */}
      <div className="lg:col-span-7 flex flex-col hibit-panel rounded-lg overflow-hidden">
        {/* Top Viewer Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b-2 border-[#4C172D] bg-[#1B0D18] px-4 py-2.5">
          <div className="flex items-center gap-2 text-xs text-rose-200 min-w-0">
            <span className="font-bold text-white truncate max-w-[220px]">
              {modelSource}
            </span>
            {glbError && <span className="text-rose-400">· {glbError}</span>}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={glbInputRef}
              type="file"
              accept=".glb,.gltf"
              onChange={handleLoadGlb}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => glbInputRef.current?.click()}
              className="flex items-center gap-1.5 rounded-sm border border-[#6E1D3B] bg-[#120910] px-2.5 py-1.5 text-[11px] font-semibold text-rose-100 hover:border-yellow-400 hover:text-white transition-colors cursor-pointer whitespace-nowrap"
            >
              <FolderUp className="h-3.5 w-3.5 text-yellow-400" />
              <span>Carregar .glb local</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setSelectedAlt(null);
                sceneCtrlRef.current?.resetView();
              }}
              className="flex items-center gap-1.5 rounded-sm border border-[#6E1D3B] bg-[#120910] px-2.5 py-1.5 text-[11px] font-semibold text-rose-100 hover:text-white transition-colors cursor-pointer whitespace-nowrap"
            >
              <RotateCcw className="h-3.5 w-3.5 text-rose-300" />
              <span>Resetar Câmera</span>
            </button>

            <button
              type="button"
              onClick={() => setInspectorMode((prev) => !prev)}
              className={`flex items-center gap-1.5 rounded-sm border-2 px-2.5 py-1.5 text-[11px] font-bold transition-colors cursor-pointer whitespace-nowrap ${
                inspectorMode
                  ? 'border-cyan-200 bg-cyan-400 text-[#0B060B]'
                  : 'border-yellow-400/70 bg-[#881337] text-yellow-300 hover:bg-[#9F1239]'
              }`}
            >
              <Code2 className="h-3.5 w-3.5" />
              <span>Modo Inspetor (Dev)</span>
            </button>
          </div>
        </div>

        {/* 3D Canvas Container */}
        <div className="relative flex-1 min-h-[440px] lg:min-h-[520px]">
          <div ref={mountRef} className="h-full w-full min-h-[440px] lg:min-h-[520px]" />

          {/* Floating 3D-Projected Target Label */}
          {floatingLabel.visible && floatingLabel.text && (
            <div
              className={`pointer-events-none absolute -translate-x-1/2 -translate-y-full rounded-lg border px-3 py-1.5 text-xs font-bold shadow-xl whitespace-nowrap ${
                floatingLabel.mode === 'correct'
                  ? 'border-emerald-400 bg-[#06281E] text-emerald-300'
                  : floatingLabel.mode === 'wrong'
                  ? 'border-rose-400 bg-[#2C0B12] text-rose-300'
                  : 'border-cyan-400 bg-[#091C2B] text-cyan-300'
              }`}
              style={{
                left: `${floatingLabel.x}px`,
                top: `${floatingLabel.y}px`,
              }}
            >
              {floatingLabel.text}
            </div>
          )}

          {/* Subtle navigation hint when Inspector is off */}
          {!inspectorMode && (
            <div className="pointer-events-none absolute left-3 bottom-3 rounded border border-[#6E1D3B] bg-[#140A12]/90 px-2.5 py-1 text-[11px] text-rose-200/80">
              Arraste para orbitar · Scroll para zoom · Botão direito para mover
            </div>
          )}

          {/* Inspector Mode Card (solid surface, zero backdrop-blur over WebGL) */}
          {inspectorMode && (
            <div className="absolute inset-x-3 bottom-3 rounded border-2 border-cyan-400 bg-[#120810]/95 p-4 shadow-[4px_4px_0_0_#000]">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b-2 border-[#4C172D] pb-2.5">
                <div className="flex items-center gap-2 text-xs font-bold text-cyan-300">
                  <Crosshair className="h-4 w-4" />
                  <span>Modo Inspetor (Dev) — Clique em qualquer peça no 3D</span>
                </div>
                <button
                  type="button"
                  onClick={handleCopyInspectorJson}
                  className="flex items-center gap-1.5 rounded-sm bg-cyan-400 px-3 py-1.5 text-xs font-bold text-[#0B060B] hover:bg-cyan-300 transition-colors cursor-pointer"
                >
                  {copiedJson ? (
                    <>
                      <Check className="h-3.5 w-3.5" />
                      <span>Copiado!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" />
                      <span>Copiar JSON da Cena</span>
                    </>
                  )}
                </button>
              </div>

              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3 text-xs">
                <div className="rounded-sm border border-[#4C172D] bg-[#0B060B] p-2.5">
                  <div className="text-[11px] text-rose-200/70">Mesh Clicado (objeto_alvo)</div>
                  <div className="mt-0.5 font-mono-data font-bold text-yellow-300 truncate">
                    {inspectorReadout.meshName}
                  </div>
                </div>
                <div className="rounded-sm border border-[#4C172D] bg-[#0B060B] p-2.5">
                  <div className="text-[11px] text-rose-200/70">camera_foco</div>
                  <div className="mt-0.5 font-mono-data text-rose-100">
                    [{inspectorReadout.cameraPos.join(', ')}]
                  </div>
                </div>
                <div className="rounded-sm border border-[#4C172D] bg-[#0B060B] p-2.5">
                  <div className="text-[11px] text-rose-200/70">alvo_lookat</div>
                  <div className="mt-0.5 font-mono-data text-rose-100">
                    [{inspectorReadout.targetPos.join(', ')}]
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
