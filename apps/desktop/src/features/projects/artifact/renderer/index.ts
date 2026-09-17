export { ArtifactScene } from "./ArtifactScene";
export { CanvasRenderSync, TileResizeRecovery } from "./SceneChrome";
export { EFFECTS, getCanvasCamera, getSceneBackgroundColor, usesTransparentBackground } from "./constants";
export {
  type ArtifactRuntimeState,
  initialImageIndexForState,
  makeRuntime,
  recordInteraction,
} from "./sceneMath";
