import React, { useEffect, useRef } from 'react';
import { RotateCcw, Save } from 'lucide-react';
import { AvatarConfig, GlassesStyle } from '../types/course';
import { AvatarSceneController } from '../three/AvatarScene';

interface AvatarCreatorProps {
  config: AvatarConfig;
  onChangeConfig: (next: AvatarConfig) => void;
}

const HELMET_COLORS = [
  { label: 'Amarelo Elétrico', hex: '#FACC15' },
  { label: 'Branco Engenheiro', hex: '#F8FAFC' },
  { label: 'Ciano VDC', hex: '#22D3EE' },
  { label: 'Laranja Obra', hex: '#F97316' },
  { label: 'Vermelho Segurança', hex: '#EF4444' },
  { label: 'Azul BIM', hex: '#3B82F6' },
];

const SKIN_COLORS = [
  { label: 'Claro Rosado', hex: '#F5CBA7' },
  { label: 'Dourado Médio', hex: '#E0AC69' },
  { label: 'Oliva', hex: '#C68642' },
  { label: 'Bronzeado', hex: '#A5694F' },
  { label: 'Escuro Quente', hex: '#78462A' },
  { label: 'Ébano', hex: '#4A2C1D' },
];

const VEST_COLORS = [
  { label: 'Laranja Alta Visibilidade', hex: '#EA580C' },
  { label: 'Amarelo Fluorescente', hex: '#EAB308' },
  { label: 'Verde Lima Obra', hex: '#84CC16' },
  { label: 'Ciano Técnico', hex: '#06B6D4' },
  { label: 'Grafite Tático', hex: '#334155' },
];

const GLASSES_OPTIONS: { id: GlassesStyle; label: string; desc: string }[] = [
  { id: 'none', label: 'Sem Óculos', desc: 'Rosto livre' },
  { id: 'clear', label: 'Clássico Incolor', desc: 'Proteção padrão' },
  { id: 'amber', label: 'Viseira Âmbar', desc: 'Contraste interno' },
  { id: 'tinted', label: 'Escuro Obra', desc: 'Área externa' },
  { id: 'cyan_visor', label: 'Viseira Ciano VDC', desc: 'Leitura laser' },
];

export const AvatarCreator: React.FC<AvatarCreatorProps> = ({
  config,
  onChangeConfig,
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const controllerRef = useRef<AvatarSceneController | null>(null);
  const initialConfigRef = useRef(config);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const ctrl = new AvatarSceneController(container, initialConfigRef.current);
    controllerRef.current = ctrl;

    return () => {
      ctrl.dispose();
      controllerRef.current = null;
    };
  }, []);

  useEffect(() => {
    controllerRef.current?.applyConfig(config);
  }, [config]);

  const updateField = <K extends keyof AvatarConfig>(key: K, value: AvatarConfig[K]) => {
    onChangeConfig({ ...config, [key]: value });
  };

  return (
    <section className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6 lg:py-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b-2 border-[#4C172D] pb-5">
        <div>
          <p className="text-xs font-medium text-rose-300">
            B15 - Academy · Personagem 3D Interativo
          </p>
          <h1 className="mt-1 font-display text-2xl sm:text-3xl font-bold text-white">
            Meu Avatar de Obra &amp; BIM
          </h1>
        </div>
        <div className="flex items-center gap-2 text-xs text-rose-200/80">
          <Save className="h-3.5 w-3.5 text-emerald-400" />
          <span>Salvo automaticamente no dispositivo</span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 items-stretch">
        {/* 3D Interactive Viewport */}
        <div className="lg:col-span-7 relative min-h-[440px] lg:min-h-[560px] overflow-hidden rounded-lg border-2 border-[#4C172D] bg-[#0B060B] shadow-[4px_4px_0_0_#000]">
          <div ref={mountRef} className="h-full w-full min-h-[440px] lg:min-h-[560px]" />

          <div className="pointer-events-none absolute left-4 top-4 rounded border border-[#6E1D3B] bg-[#140A12]/90 px-3 py-2 text-xs text-rose-200">
            Arraste para girar 360° · Scroll para zoom
          </div>

          <button
            type="button"
            onClick={() => controllerRef.current?.resetCamera()}
            className="absolute right-4 top-4 flex items-center gap-1.5 rounded-sm border-2 border-[#6E1D3B] bg-[#1B0D18] px-3 py-2 text-xs font-bold text-yellow-300 hover:bg-[#2C1324] transition-colors cursor-pointer"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>Resetar Visão</span>
          </button>
        </div>

        {/* Customization Controls */}
        <div className="lg:col-span-5 flex flex-col justify-between gap-6 hibit-panel rounded-lg p-5 sm:p-6">
          <div className="space-y-6">
            {/* Profile Name */}
            <div>
              <label
                htmlFor="avatar-name-input"
                className="block text-xs font-bold text-rose-200 mb-2"
              >
                Nome do Perfil
              </label>
              <input
                id="avatar-name-input"
                type="text"
                maxLength={32}
                value={config.name}
                onChange={(e) => updateField('name', e.target.value)}
                placeholder="Ex: Eng. Lucas Silva"
                className="w-full rounded-sm border-2 border-[#4C172D] bg-[#0B060B] px-3.5 py-2.5 text-sm text-white placeholder-rose-300/40 focus:border-yellow-400 focus:outline-none"
              />
            </div>

            {/* Helmet Color */}
            <div>
              <div className="flex items-center justify-between text-xs mb-2.5">
                <span className="font-bold text-rose-200">Cor do Capacete de Obra</span>
                <span className="text-rose-300/80">
                  {HELMET_COLORS.find((c) => c.hex === config.helmetColor)?.label ?? config.helmetColor}
                </span>
              </div>
              <div className="grid grid-cols-6 gap-2.5">
                {HELMET_COLORS.map((item) => {
                  const active = config.helmetColor.toLowerCase() === item.hex.toLowerCase();
                  return (
                    <button
                      key={item.hex}
                      type="button"
                      title={item.label}
                      aria-label={`Capacete ${item.label}`}
                      onClick={() => updateField('helmetColor', item.hex)}
                      className={`h-10 rounded-sm border-2 transition-transform cursor-pointer ${
                        active
                          ? 'scale-105 border-white ring-2 ring-yellow-400'
                          : 'border-[#4C172D] hover:scale-105'
                      }`}
                      style={{ backgroundColor: item.hex }}
                    />
                  );
                })}
              </div>
            </div>

            {/* Skin Tone */}
            <div>
              <div className="flex items-center justify-between text-xs mb-2.5">
                <span className="font-bold text-rose-200">Tom de Pele</span>
                <span className="text-rose-300/80">
                  {SKIN_COLORS.find((c) => c.hex === config.skinColor)?.label ?? config.skinColor}
                </span>
              </div>
              <div className="grid grid-cols-6 gap-2.5">
                {SKIN_COLORS.map((item) => {
                  const active = config.skinColor.toLowerCase() === item.hex.toLowerCase();
                  return (
                    <button
                      key={item.hex}
                      type="button"
                      title={item.label}
                      aria-label={`Pele ${item.label}`}
                      onClick={() => updateField('skinColor', item.hex)}
                      className={`h-10 rounded-sm border-2 transition-transform cursor-pointer ${
                        active
                          ? 'scale-105 border-white ring-2 ring-cyan-400'
                          : 'border-[#4C172D] hover:scale-105'
                      }`}
                      style={{ backgroundColor: item.hex }}
                    />
                  );
                })}
              </div>
            </div>

            {/* Reflective Vest Color */}
            <div>
              <div className="flex items-center justify-between text-xs mb-2.5">
                <span className="font-bold text-rose-200">Cor do Colete Refletivo</span>
                <span className="text-rose-300/80">
                  {VEST_COLORS.find((c) => c.hex === config.vestColor)?.label ?? config.vestColor}
                </span>
              </div>
              <div className="grid grid-cols-5 gap-2.5">
                {VEST_COLORS.map((item) => {
                  const active = config.vestColor.toLowerCase() === item.hex.toLowerCase();
                  return (
                    <button
                      key={item.hex}
                      type="button"
                      title={item.label}
                      aria-label={`Colete ${item.label}`}
                      onClick={() => updateField('vestColor', item.hex)}
                      className={`h-10 rounded-sm border-2 transition-transform cursor-pointer ${
                        active
                          ? 'scale-105 border-white ring-2 ring-yellow-400'
                          : 'border-[#4C172D] hover:scale-105'
                      }`}
                      style={{ backgroundColor: item.hex }}
                    />
                  );
                })}
              </div>
            </div>

            {/* Safety Glasses */}
            <div>
              <div className="text-xs font-bold text-rose-200 mb-2.5">
                Estilo de Óculos de Proteção
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {GLASSES_OPTIONS.map((opt) => {
                  const active = config.glassesStyle === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => updateField('glassesStyle', opt.id)}
                      className={`flex flex-col items-start rounded-sm border-2 px-3 py-2.5 text-left transition-colors cursor-pointer ${
                        active
                          ? 'border-yellow-400 bg-[#881337]/60 text-white'
                          : 'border-[#4C172D] bg-[#0B060B] text-rose-100 hover:border-rose-400'
                      }`}
                    >
                      <span className="text-xs font-bold">{opt.label}</span>
                      <span className="text-[11px] text-rose-200/70">{opt.desc}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="border-t-2 border-[#3D1325] pt-4 text-xs text-rose-200/75">
            Modelo autoral geométrico em Three.js PBR. Sua aparência também aparece em miniatura nas fases do Mapa das Ilhas 3D.
          </div>
        </div>
      </div>
    </section>
  );
};
