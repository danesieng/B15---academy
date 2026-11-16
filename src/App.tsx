import { useCallback, useEffect, useMemo, useState } from 'react';
import episodiosJson from './data/episodios.json';
import {
  ActivitySubmission,
  AppTab,
  AvatarConfig,
  EpisodeData,
  StudentProgressState,
  XpNotification,
} from './types/course';
import {
  XP_REWARDS,
  calculateLevelInfo,
  loadProgress,
  saveProgress,
} from './utils/gamification';
import { TopGamificationBar } from './components/TopGamificationBar';
import { IslandsMap } from './components/IslandsMap';
import { AvatarCreator } from './components/AvatarCreator';
import { EpisodeView } from './components/EpisodeView';
import { InstructorPanel } from './components/InstructorPanel';

const EPISODES = episodiosJson as EpisodeData[];

export default function App() {
  const [progress, setProgress] = useState<StudentProgressState>(() => loadProgress());
  const [activeTab, setActiveTab] = useState<AppTab>('map');
  const [activeEpisodeId, setActiveEpisodeId] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<XpNotification[]>([]);

  useEffect(() => {
    saveProgress(progress);
  }, [progress]);

  const dismissNotification = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const pushXpNotification = useCallback(
    (amount: number, reason: string, oldXp: number, newXp: number) => {
      const oldLevel = calculateLevelInfo(oldXp).level;
      const newLevel = calculateLevelInfo(newXp).level;
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

      setNotifications((prev) => [
        ...prev,
        {
          id,
          amount,
          reason,
          leveledUp: newLevel > oldLevel,
          newLevel,
        },
      ]);

      window.setTimeout(() => {
        setNotifications((prev) => prev.filter((n) => n.id !== id));
      }, 4500);
    },
    []
  );

  const handleSelectTab = (tab: AppTab) => {
    setActiveTab(tab);
    if (tab !== 'map') {
      setActiveEpisodeId(null);
    } else if (activeTab === 'map') {
      setActiveEpisodeId(null);
    }
  };

  const handleAvatarChange = (avatar: AvatarConfig) => {
    setProgress((prev) => ({
      ...prev,
      avatar,
    }));
  };

  const handleCompleteVideo = useCallback(
    (episodeId: string) => {
      setProgress((prev) => {
        const currentLesson = prev.lessons[episodeId] ?? {
          videoConcluido: false,
          quizConcluido: false,
          questoesAcertadas: [],
        };

        if (currentLesson.videoConcluido) {
          return prev;
        }

        const oldXp = prev.xp;
        const newXp = oldXp + XP_REWARDS.VIDEO_COMPLETED;
        pushXpNotification(
          XP_REWARDS.VIDEO_COMPLETED,
          'Aula assistida (Etapa A)',
          oldXp,
          newXp
        );

        return {
          ...prev,
          xp: newXp,
          lessons: {
            ...prev.lessons,
            [episodeId]: {
              ...currentLesson,
              videoConcluido: true,
            },
          },
        };
      });
    },
    [pushXpNotification]
  );

  const handleQuestionCorrect = useCallback(
    (episodeId: string, questionId: string) => {
      const episode = EPISODES.find((ep) => ep.id === episodeId);
      const totalQuestions = episode?.quiz.length ?? 1;

      setProgress((prev) => {
        const currentLesson = prev.lessons[episodeId] ?? {
          videoConcluido: false,
          quizConcluido: false,
          questoesAcertadas: [],
        };

        if (currentLesson.questoesAcertadas.includes(questionId)) {
          return prev;
        }

        const updatedCorrect = [...currentLesson.questoesAcertadas, questionId];
        const quizConcluido = updatedCorrect.length >= totalQuestions;

        const oldXp = prev.xp;
        const newXp = oldXp + XP_REWARDS.QUIZ_CORRECT;
        pushXpNotification(
          XP_REWARDS.QUIZ_CORRECT,
          'Acerto no Quiz 3D (Etapa B)',
          oldXp,
          newXp
        );

        return {
          ...prev,
          xp: newXp,
          lessons: {
            ...prev.lessons,
            [episodeId]: {
              ...currentLesson,
              questoesAcertadas: updatedCorrect,
              quizConcluido,
            },
          },
        };
      });
    },
    [pushXpNotification]
  );

  const handleSubmitActivity = useCallback(
    (submissionData: Omit<ActivitySubmission, 'id' | 'submittedAt' | 'status'>) => {
      const newSubmission: ActivitySubmission = {
        ...submissionData,
        id: `sub-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        submittedAt: new Date().toISOString(),
        status: 'Aguardando Correção',
      };

      setProgress((prev) => ({
        ...prev,
        submissions: [newSubmission, ...prev.submissions],
      }));
    },
    []
  );

  const handleApproveSubmission = useCallback(
    (submissionId: string) => {
      setProgress((prev) => {
        const target = prev.submissions.find((s) => s.id === submissionId);
        if (!target || target.status === 'Aprovada') {
          return prev;
        }

        const oldXp = prev.xp;
        const newXp = oldXp + XP_REWARDS.ACTIVITY_APPROVED;
        pushXpNotification(
          XP_REWARDS.ACTIVITY_APPROVED,
          `Atividade aprovada (${target.episodeTitle})`,
          oldXp,
          newXp
        );

        return {
          ...prev,
          xp: newXp,
          submissions: prev.submissions.map((s) =>
            s.id === submissionId ? { ...s, status: 'Aprovada' } : s
          ),
        };
      });
    },
    [pushXpNotification]
  );

  const activeEpisode = useMemo(
    () => EPISODES.find((ep) => ep.id === activeEpisodeId) ?? null,
    [activeEpisodeId]
  );

  const pendingSubmissionsCount = useMemo(
    () => progress.submissions.filter((s) => s.status === 'Aguardando Correção').length,
    [progress.submissions]
  );

  return (
    <div className="min-h-screen bg-[#0B060B] text-slate-100 flex flex-col">
      <TopGamificationBar
        activeTab={activeTab}
        onSelectTab={handleSelectTab}
        xp={progress.xp}
        avatar={progress.avatar}
        pendingSubmissionsCount={pendingSubmissionsCount}
        notifications={notifications}
        onDismissNotification={dismissNotification}
      />

      <div className="flex-1">
        {activeTab === 'map' && activeEpisode ? (
          <EpisodeView
            episode={activeEpisode}
            progress={
              progress.lessons[activeEpisode.id] ?? {
                videoConcluido: false,
                quizConcluido: false,
                questoesAcertadas: [],
              }
            }
            studentName={progress.avatar.name}
            submissions={progress.submissions}
            onBackToMap={() => setActiveEpisodeId(null)}
            onCompleteVideo={handleCompleteVideo}
            onQuestionCorrect={handleQuestionCorrect}
            onSubmitActivity={handleSubmitActivity}
          />
        ) : activeTab === 'map' ? (
          <IslandsMap
            episodes={EPISODES}
            lessonsProgress={progress.lessons}
            avatar={progress.avatar}
            xp={progress.xp}
            onSelectEpisode={(episodeId) => setActiveEpisodeId(episodeId)}
          />
        ) : activeTab === 'avatar' ? (
          <AvatarCreator
            config={progress.avatar}
            onChangeConfig={handleAvatarChange}
          />
        ) : (
          <InstructorPanel
            submissions={progress.submissions}
            onApproveSubmission={handleApproveSubmission}
          />
        )}
      </div>
    </div>
  );
}
