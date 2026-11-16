import React from 'react';
import { Award, Compass, ShieldCheck, User, Zap } from 'lucide-react';
import { AppTab, AvatarConfig, XpNotification } from '../types/course';
import { calculateLevelInfo } from '../utils/gamification';

interface TopGamificationBarProps {
  activeTab: AppTab;
  onSelectTab: (tab: AppTab) => void;
  xp: number;
  avatar: AvatarConfig;
  pendingSubmissionsCount: number;
  notifications: XpNotification[];
  onDismissNotification: (id: string) => void;
}

export function AvatarMiniSvg({ avatar, size = 36 }: { avatar: AvatarConfig; size?: number }) {
  return (
    <svg
      viewBox="0 0 40 40"
      width={size}
      height={size}
      className="shrink-0 rounded border-2 border-[#6E1D3B] bg-[#160B14]"
      aria-hidden="true"
    >
      {/* Reflective Vest */}
      <path d="M8 38 C8 29 12 26 20 26 C28 26 32 29 32 38 Z" fill={avatar.vestColor} />
      <rect x="12" y="31" width="16" height="2.4" fill="#F1F5F9" />
      {/* Neck & Face */}
      <rect x="17" y="23" width="6" height="4" fill={avatar.skinColor} />
      <rect x="12.5" y="11" width="15" height="13.5" rx="3" fill={avatar.skinColor} />
      {/* Eyes */}
      <rect x="15.8" y="16.5" width="2.2" height="2.4" fill="#0F172A" />
      <rect x="22" y="16.5" width="2.2" height="2.4" fill="#0F172A" />
      {/* Glasses */}
      {avatar.glassesStyle !== 'none' && (
        <rect
          x="13.5"
          y="15.3"
          width="13"
          height="4.4"
          rx="1"
          fill={
            avatar.glassesStyle === 'amber'
              ? '#F59E0B'
              : avatar.glassesStyle === 'cyan_visor'
              ? '#22D3EE'
              : avatar.glassesStyle === 'tinted'
              ? '#090D16'
              : '#BAE6FD'
          }
          fillOpacity={avatar.glassesStyle === 'tinted' ? 0.85 : 0.58}
          stroke="#1E293B"
          strokeWidth="1"
        />
      )}
      {/* Safety Helmet */}
      <path d="M10.5 13.5 C10.5 6.8 14.5 4.5 20 4.5 C25.5 4.5 29.5 6.8 29.5 13.5 Z" fill={avatar.helmetColor} />
      <rect x="9" y="12.5" width="22" height="2.6" rx="1" fill={avatar.helmetColor} />
    </svg>
  );
}

export const TopGamificationBar: React.FC<TopGamificationBarProps> = ({
  activeTab,
  onSelectTab,
  xp,
  avatar,
  pendingSubmissionsCount,
  notifications,
  onDismissNotification,
}) => {
  const levelInfo = calculateLevelInfo(xp);

  return (
    <>
      <header className="sticky top-0 z-40 border-b-2 border-[#4C172D] bg-[#10070E]/95">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:flex-nowrap lg:gap-8">
          {/* Zone 1: Brand + Student Avatar & Level Progress */}
          <div className="flex items-center gap-4 min-w-0">
            <button
              type="button"
              onClick={() => onSelectTab('map')}
              className="flex items-center gap-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400 rounded whitespace-nowrap shrink-0 cursor-pointer"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded border-2 border-yellow-300 bg-[#881337] text-yellow-300 shadow-[2px_2px_0_0_#000]">
                <Zap className="h-4.5 w-4.5 stroke-[2.5]" />
              </span>
              <span className="font-display text-xl font-bold tracking-wide text-white">
                B15 - Academy
              </span>
            </button>

            <span className="hidden h-6 w-0.5 bg-[#4C172D] sm:block" aria-hidden="true" />

            <div className="flex items-center gap-3 min-w-0">
              <AvatarMiniSvg avatar={avatar} size={38} />
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-xs text-rose-100">
                  <span className="font-semibold text-white truncate max-w-[140px]">
                    {avatar.name || 'Aluno VDC'}
                  </span>
                  <span className="text-rose-400/60" aria-hidden="true">·</span>
                  <span className="font-mono-data text-yellow-400 font-bold whitespace-nowrap">
                    Nível {levelInfo.level}
                  </span>
                  <span className="hidden xl:inline text-rose-200/70 whitespace-nowrap">
                    ({levelInfo.title})
                  </span>
                </div>

                {/* HI-bit Segmented XP Bar */}
                <div className="mt-1 flex items-center gap-2.5">
                  <div className="h-2 w-28 sm:w-36 overflow-hidden rounded-sm border border-[#6E1D3B] bg-[#090409]">
                    <div
                      className="h-full bg-gradient-to-r from-rose-500 via-amber-400 to-yellow-300 transition-all duration-300"
                      style={{ width: `${levelInfo.progressPercent}%` }}
                    />
                  </div>
                  <span className="font-mono-data text-[11px] font-semibold text-yellow-300 whitespace-nowrap">
                    {xp} XP
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Zone 2: Primary Navigation Tabs */}
          <nav
            aria-label="Navegação Principal"
            className="flex items-center gap-1.5 rounded border-2 border-[#4C172D] bg-[#160B14] p-1 shrink-0"
          >
            <button
              type="button"
              onClick={() => onSelectTab('map')}
              className={`flex items-center gap-2 rounded-sm px-3.5 py-2 text-xs font-bold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeTab === 'map'
                  ? 'bg-[#9F1239] text-yellow-300 border border-yellow-400/70 shadow-[2px_2px_0_0_#000]'
                  : 'text-rose-100/80 hover:bg-[#2A1121] hover:text-white border border-transparent'
              }`}
            >
              <Compass className="h-3.5 w-3.5" />
              <span>Mapa das Ilhas</span>
            </button>

            <button
              type="button"
              onClick={() => onSelectTab('avatar')}
              className={`flex items-center gap-2 rounded-sm px-3.5 py-2 text-xs font-bold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeTab === 'avatar'
                  ? 'bg-[#9F1239] text-yellow-300 border border-yellow-400/70 shadow-[2px_2px_0_0_#000]'
                  : 'text-rose-100/80 hover:bg-[#2A1121] hover:text-white border border-transparent'
              }`}
            >
              <User className="h-3.5 w-3.5" />
              <span>Meu Avatar</span>
            </button>

            <button
              type="button"
              onClick={() => onSelectTab('instructor')}
              className={`flex items-center gap-2 rounded-sm px-3.5 py-2 text-xs font-bold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeTab === 'instructor'
                  ? 'bg-cyan-400 text-[#0B060B] border border-cyan-200 shadow-[2px_2px_0_0_#000]'
                  : 'text-rose-100/80 hover:bg-[#2A1121] hover:text-white border border-transparent'
              }`}
            >
              <ShieldCheck className="h-3.5 w-3.5" />
              <span>Painel do Instrutor</span>
              {pendingSubmissionsCount > 0 && (
                <span
                  className={`font-mono-data text-[11px] font-bold ${
                    activeTab === 'instructor' ? 'text-[#0B060B]' : 'text-yellow-400'
                  }`}
                >
                  ({pendingSubmissionsCount})
                </span>
              )}
            </button>
          </nav>
        </div>
      </header>

      {/* XP & Level-Up Notification Toast Stack */}
      {notifications.length > 0 && (
        <div
          aria-live="polite"
          className="fixed right-4 top-20 z-50 flex flex-col gap-2.5 max-w-xs w-full pointer-events-none"
        >
          {notifications.map((notif) => (
            <div
              key={notif.id}
              onClick={() => onDismissNotification(notif.id)}
              className="pointer-events-auto cursor-pointer rounded border-2 border-yellow-400 bg-[#1B0B16] px-4 py-3 shadow-[4px_4px_0_0_#000] transition-transform duration-200 animate-[fadeSlideIn_0.25s_ease-out]"
            >
              <div className="flex items-center gap-2.5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded border border-yellow-400/50 bg-[#881337] text-yellow-300">
                  <Award className="h-4.5 w-4.5" />
                </span>
                <div>
                  <div className="font-display text-base font-bold text-yellow-300">
                    +{notif.amount} XP
                  </div>
                  <div className="text-xs text-rose-100">{notif.reason}</div>
                </div>
              </div>
              {notif.leveledUp && (
                <div className="mt-2 rounded-sm border border-cyan-400/50 bg-cyan-950/50 px-2.5 py-1.5 text-xs font-bold text-cyan-300 flex items-center justify-between">
                  <span>Subiu de Nível!</span>
                  <span className="font-mono-data text-yellow-300">
                    Nível {notif.newLevel}
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
};
