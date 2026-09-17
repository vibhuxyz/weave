import type * as THREE from "three";

export interface PlaneUniforms {
  uMap: THREE.IUniform<THREE.Texture | null>;
  uOpacity: THREE.IUniform<number>;
  uRadius: THREE.IUniform<number>;
}

export interface BackdropUniforms {
  uBoxSize: THREE.IUniform<THREE.Vector3>;
  uMap: THREE.IUniform<THREE.Texture | null>;
  uMapNext: THREE.IUniform<THREE.Texture | null>;
  uMix: THREE.IUniform<number>;
  uOpacity: THREE.IUniform<number>;
}

export interface FlatProjectionUniforms {
  uBoundsMin: THREE.IUniform<THREE.Vector3>;
  uBoundsSize: THREE.IUniform<THREE.Vector3>;
  uMix: THREE.IUniform<number>;
  uOpacity: THREE.IUniform<number>;
  uTexture: THREE.IUniform<THREE.Texture | null>;
  uTexture2: THREE.IUniform<THREE.Texture | null>;
}

export const roundedPlaneVertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const roundedPlaneFragmentShader = /* glsl */ `
  uniform sampler2D uMap;
  uniform float uOpacity;
  uniform float uRadius;
  varying vec2 vUv;

  float roundedBoxSDF(vec2 p, vec2 b, float r) {
    vec2 d = abs(p) - b + r;
    return length(max(d, 0.0)) - r;
  }

  void main() {
    vec2 p = vUv - 0.5;
    float d = roundedBoxSDF(p, vec2(0.5), uRadius);
    if (d > 0.0) discard;

    vec4 texColor = texture2D(uMap, vUv);
    gl_FragColor = vec4(texColor.rgb, texColor.a * uOpacity);
  }
`;

export const backdropVertexShader = /* glsl */ `
  varying vec3 vLocalPos;
  varying vec3 vLocalNormal;
  void main() {
    vLocalPos = position;
    vLocalNormal = normal;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const backdropFragmentShader = /* glsl */ `
  uniform sampler2D uMap;
  uniform sampler2D uMapNext;
  uniform float uMix;
  uniform float uOpacity;
  uniform vec3 uBoxSize;
  varying vec3 vLocalPos;
  varying vec3 vLocalNormal;

  vec3 blurSample(sampler2D tex, vec2 uv, float radius) {
    vec3 col = vec3(0.0);
    float total = 0.0;
    for (float x = -1.0; x <= 1.0; x += 1.0) {
      for (float y = -1.0; y <= 1.0; y += 1.0) {
        float w = 1.0 - 0.3 * (abs(x) + abs(y));
        col += texture2D(tex, uv + vec2(x, y) * radius).rgb * w;
        total += w;
      }
    }
    return col / total;
  }

  void main() {
    vec3 blend = abs(vLocalNormal);
    blend = pow(blend, vec3(2.0));
    blend /= (blend.x + blend.y + blend.z);

    vec2 uvXY = vLocalPos.xy / (uBoxSize.xy * 0.86) + 0.5;
    vec2 uvXZ = vLocalPos.xz / (uBoxSize.xz * 0.86) + 0.5;
    vec2 uvYZ = vLocalPos.yz / (uBoxSize.yz * 0.86) + 0.5;

    float blurRadius = 0.7;
    vec3 colA_XY = blurSample(uMap, uvXY, blurRadius);
    vec3 colA_XZ = blurSample(uMap, uvXZ, blurRadius);
    vec3 colA_YZ = blurSample(uMap, uvYZ, blurRadius);
    vec3 colorA = colA_XY * blend.z + colA_XZ * blend.y + colA_YZ * blend.x;

    vec3 colB_XY = blurSample(uMapNext, uvXY, blurRadius);
    vec3 colB_XZ = blurSample(uMapNext, uvXZ, blurRadius);
    vec3 colB_YZ = blurSample(uMapNext, uvYZ, blurRadius);
    vec3 colorB = colB_XY * blend.z + colB_XZ * blend.y + colB_YZ * blend.x;

    vec3 color = mix(colorA, colorB, uMix);
    float lum = dot(color, vec3(0.299, 0.587, 0.114));
    color = mix(vec3(lum), color, 1.35);

    gl_FragColor = vec4(color, uOpacity);
  }
`;

export const flatProjectionVertexShader = /* glsl */ `
  varying vec3 vWorldPos;
  void main() {
    vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const flatProjectionFragmentShader = /* glsl */ `
  uniform sampler2D uTexture;
  uniform sampler2D uTexture2;
  uniform float uMix;
  uniform float uOpacity;
  uniform vec3 uBoundsMin;
  uniform vec3 uBoundsSize;
  varying vec3 vWorldPos;

  void main() {
    vec2 uv = (vWorldPos.xy - uBoundsMin.xy) / uBoundsSize.xy;
    vec4 texA = texture2D(uTexture, uv);
    vec4 texB = texture2D(uTexture2, uv);
    vec4 color = mix(texA, texB, uMix);
    gl_FragColor = vec4(color.rgb, color.a * uOpacity);
  }
`;
