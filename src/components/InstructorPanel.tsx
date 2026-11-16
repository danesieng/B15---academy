import React, { useMemo, useState } from 'react';
import { CheckCircle2, Clock, FileText, ShieldCheck, ThumbsUp } from 'lucide-react';
import { ActivitySubmission } from '../types/course';

interface InstructorPanelProps {
  submissions: ActivitySubmission[];
  onApproveSubmission: (submissionId: string) => void;
}

type FilterMode = 'all' | 'pending' | 'approved';

export const InstructorPanel: React.FC<InstructorPanelProps> = ({
  submissions,
  onApproveSubmission,
}) => {
  const [filter, setFilter] = useState<FilterMode>('all');

  const filteredSubmissions = useMemo(() => {
    const sorted = [...submissions].sort(
      (a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime()
    );
    if (filter === 'pending') {
      return sorted.filter((s) => s.status === 'Aguardando Correção');
    }
    if (filter === 'approved') {
      return sorted.filter((s) => s.status === 'Aprovada');
    }
    return sorted;
  }, [submissions, filter]);

  const pendingCount = submissions.filter(
    (s) => s.status === 'Aguardando Correção'
  ).length;
  const approvedCount = submissions.filter((s) => s.status === 'Aprovada').length;

  return (
    <section className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6 lg:py-8">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b-2 border-[#4C172D] pb-5">
        <div>
          <p className="text-xs font-medium text-rose-300">
            B15 - Academy · Avaliação de Shop Drawings
          </p>
          <h1 className="mt-1 font-display text-2xl sm:text-3xl font-bold text-white">
            Painel do Instrutor
          </h1>
        </div>

        {/* Filter Tabs */}
        <div className="flex items-center gap-1 rounded-sm border-2 border-[#4C172D] bg-[#160B14] p-1">
          <button
            type="button"
            onClick={() => setFilter('all')}
            className={`rounded-sm px-3 py-1.5 text-xs font-bold transition-colors cursor-pointer whitespace-nowrap ${
              filter === 'all'
                ? 'bg-[#9F1239] text-yellow-300'
                : 'text-rose-200/80 hover:text-white'
            }`}
          >
            Todas ({submissions.length})
          </button>
          <button
            type="button"
            onClick={() => setFilter('pending')}
            className={`rounded-sm px-3 py-1.5 text-xs font-bold transition-colors cursor-pointer whitespace-nowrap ${
              filter === 'pending'
                ? 'bg-yellow-400 text-[#0B060B]'
                : 'text-rose-200/80 hover:text-white'
            }`}
          >
            Aguardando ({pendingCount})
          </button>
          <button
            type="button"
            onClick={() => setFilter('approved')}
            className={`rounded-sm px-3 py-1.5 text-xs font-bold transition-colors cursor-pointer whitespace-nowrap ${
              filter === 'approved'
                ? 'bg-emerald-400 text-[#0B060B]'
                : 'text-rose-200/80 hover:text-white'
            }`}
          >
            Aprovadas ({approvedCount})
          </button>
        </div>
      </div>

      {filteredSubmissions.length === 0 ? (
        <div className="mt-8 hibit-panel rounded-lg p-10 text-center">
          <ShieldCheck className="mx-auto h-10 w-10 text-rose-400" />
          <h2 className="mt-3 font-display text-lg font-bold text-white">
            Nenhuma atividade encontrada neste filtro
          </h2>
          <p className="mt-1.5 text-sm text-rose-200/75 max-w-md mx-auto">
            Quando um aluno enviar uma imagem ou PDF na Etapa C de qualquer episódio, a entrega aparecerá aqui para revisão e liberação de +150 XP.
          </p>
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          {filteredSubmissions.map((item) => {
            const isApproved = item.status === 'Aprovada';
            const isImage = item.fileType.startsWith('image/');

            return (
              <article
                key={item.id}
                className="hibit-panel flex flex-col justify-between rounded-lg overflow-hidden"
              >
                <div>
                  {/* Preview Container */}
                  <div className="relative h-52 w-full bg-[#0B060B] border-b-2 border-[#4C172D] flex items-center justify-center overflow-hidden">
                    {isImage && item.fileDataUrl ? (
                      <img
                        src={item.fileDataUrl}
                        alt={`Entregável de ${item.studentName} para ${item.episodeTitle}`}
                        referrerPolicy="no-referrer"
                        className="h-full w-full object-contain p-2"
                      />
                    ) : (
                      <div className="flex flex-col items-center justify-center gap-2 p-4 text-center">
                        <FileText className="h-10 w-10 text-yellow-400" />
                        <span className="text-xs font-semibold text-white truncate max-w-[240px]">
                          {item.fileName}
                        </span>
                        <span className="text-[11px] text-rose-200/70">
                          Documento PDF / Anexo Técnico
                        </span>
                        {item.fileDataUrl && (
                          <a
                            href={item.fileDataUrl}
                            download={item.fileName}
                            className="mt-1 rounded-sm border border-yellow-400/50 bg-[#881337] px-3 py-1 text-xs font-bold text-yellow-300 hover:bg-[#9F1239]"
                          >
                            Baixar Arquivo
                          </a>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Metadata & Notes */}
                  <div className="p-5">
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="font-mono-data text-rose-300/80">
                        {new Date(item.submittedAt).toLocaleString('pt-BR', {
                          dateStyle: 'short',
                          timeStyle: 'short',
                        })}
                      </span>
                      {isApproved ? (
                        <span className="flex items-center gap-1 font-bold text-emerald-400">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          <span>Aprovada</span>
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 font-bold text-yellow-400">
                          <Clock className="h-3.5 w-3.5" />
                          <span>Aguardando Correção</span>
                        </span>
                      )}
                    </div>

                    <h3 className="mt-2 font-display text-base font-bold text-white">
                      {item.episodeTitle}
                    </h3>
                    <div className="mt-1 text-xs text-rose-200/80">
                      Aluno: <span className="font-semibold text-white">{item.studentName}</span>
                    </div>

                    {item.notes && (
                      <p className="mt-3 rounded-sm border border-[#4C172D] bg-[#0B060B] p-3 text-xs text-rose-100 leading-relaxed">
                        {item.notes}
                      </p>
                    )}
                  </div>
                </div>

                {/* Action Footer */}
                <div className="border-t-2 border-[#3D1325] p-4 bg-[#120810]">
                  {isApproved ? (
                    <div className="flex items-center justify-between text-xs text-emerald-400 font-bold">
                      <span>Atividade validada pelo instrutor</span>
                      <span className="font-mono-data">+150 XP creditado</span>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onApproveSubmission(item.id)}
                      className="hibit-btn-gold flex w-full items-center justify-center gap-2 rounded-sm px-4 py-2.5 text-xs font-bold transition-colors cursor-pointer"
                    >
                      <ThumbsUp className="h-3.5 w-3.5" />
                      <span>Aprovar e Liberar +150 XP</span>
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
};
