export type AmbientScene = "chromatic" | "chromatic-deep";

export function chooseAmbientScene(_module: string, theme: string, _hour?: number): AmbientScene {
  // 页面身份只由图标表达，整个应用始终共享同一套多色环境；
  // 只有明暗主题切换对应的摄影素材，避免“一个模块一张皮肤”。
  void _module;
  void _hour;
  return theme === "dark" ? "chromatic-deep" : "chromatic";
}

export function AmbientEnvironment({ scene }: { scene: AmbientScene }) {
  return (
    <div className="ambient-environment" data-scene={scene} aria-hidden="true">
      <div className={`ambient-environment__image ambient-scene-${scene} is-current`} />
    </div>
  );
}
