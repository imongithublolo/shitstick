/**
 * WebGL2 CRT shader — ported from gingerbeardman/webgl-crt-shader (MIT, 2025).
 * https://github.com/gingerbeardman/webgl-crt-shader
 *
 * The fragment shader below is a faithful port of CRTShader.js (originally
 * written for Three.js / converted from a LÖVE2D shader) adapted to GLSL ES
 * 3.00 the same way the upstream raw-WebGL demo (crt-webgl.js) does it.
 */

export type CrtUniformValue = number;

export const CRT_UNIFORM_NAMES = [
  "uTexture",
  "uEnabled",
  "scanlineIntensity",
  "scanlineCount",
  "time",
  "yOffset",
  "brightness",
  "contrast",
  "saturation",
  "bloomIntensity",
  "bloomThreshold",
  "rgbShift",
  "adaptiveIntensity",
  "vignetteStrength",
  "curvature",
  "flickerStrength",
] as const;

export const CRT_VERTEX_SOURCE = `#version 300 es
precision highp float;
const vec2 pos[4] = vec2[4](
  vec2(-1.0, -1.0),
  vec2(1.0, -1.0),
  vec2(-1.0, 1.0),
  vec2(1.0, 1.0)
);
const vec2 uvData[4] = vec2[4](
  vec2(0.0, 0.0),
  vec2(1.0, 0.0),
  vec2(0.0, 1.0),
  vec2(1.0, 1.0)
);
out vec2 vUv;
void main() {
  vUv = uvData[gl_VertexID];
  gl_Position = vec4(pos[gl_VertexID], 0.0, 1.0);
}
`;

export const CRT_FRAGMENT_SOURCE = `#version 300 es
precision highp float;

uniform sampler2D uTexture;
uniform bool uEnabled;
uniform float scanlineIntensity;
uniform float scanlineCount;
uniform float time;
uniform float yOffset;
uniform float brightness;
uniform float contrast;
uniform float saturation;
uniform float bloomIntensity;
uniform float bloomThreshold;
uniform float rgbShift;
uniform float adaptiveIntensity;
uniform float vignetteStrength;
uniform float curvature;
uniform float flickerStrength;

in vec2 vUv;
out vec4 fragColor;

// Precomputed constants
const float PI = 3.14159265;
const vec3 LUMA = vec3(0.299, 0.587, 0.114);
const float BLOOM_THRESHOLD_FACTOR = 0.5;
const float BLOOM_FACTOR_MULT = 1.5;
const float RGB_SHIFT_SCALE = 0.005;
const float RGB_SHIFT_INTENSITY = 0.08;

// Optimized curvature function
vec2 curveRemapUV(vec2 uv, float curvature) {
  vec2 coords = uv * 2.0 - 1.0;
  float curveAmount = curvature * 0.25;
  float dist = dot(coords, coords);
  coords = coords * (1.0 + dist * curveAmount);
  return coords * 0.5 + 0.5;
}

// Low-cost symmetric bloom sampling (cross + center, normalized)
vec4 sampleBloom(sampler2D tex, vec2 uv, float radius, vec4 centerSample) {
  vec2 o = vec2(radius);
  vec4 c = centerSample * 0.4;
  vec4 cross = (
    texture(tex, uv + vec2(o.x, 0.0)) +
    texture(tex, uv - vec2(o.x, 0.0)) +
    texture(tex, uv + vec2(0.0, o.y)) +
    texture(tex, uv - vec2(0.0, o.y))
  ) * 0.15;
  return c + cross;
}

// Approximates vignette using Chebyshev distance squared instead of pow()
float vignetteApprox(vec2 uv, float strength) {
  vec2 vigCoord = uv * 2.0 - 1.0;
  float dist = max(abs(vigCoord.x), abs(vigCoord.y));
  return 1.0 - dist * dist * strength;
}

void bypass() {
  fragColor = texture(uTexture, vUv);
}

void mainImage() {
  vec2 uv = vUv;

  // Apply screen curvature if enabled (early out for out-of-bounds)
  if (curvature > 0.001) {
    uv = curveRemapUV(uv, curvature);
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
      fragColor = vec4(0.0);
      return;
    }
  }

  // Get the original pixel color
  vec4 pixel = texture(uTexture, uv);

  // Apply bloom effect with threshold-based sampling (skip if disabled)
  if (bloomIntensity > 0.001) {
    float pixelLum = dot(pixel.rgb, LUMA);
    float bloomThresholdHalf = bloomThreshold * BLOOM_THRESHOLD_FACTOR;
    if (pixelLum > bloomThresholdHalf) {
      vec4 bloomSample = sampleBloom(uTexture, uv, 0.005, pixel);
      bloomSample.rgb *= brightness;
      float bloomLum = dot(bloomSample.rgb, LUMA);
      float bloomFactor = bloomIntensity * max(0.0, (bloomLum - bloomThreshold) * BLOOM_FACTOR_MULT);
      pixel.rgb += bloomSample.rgb * bloomFactor;
    }
  }

  // Apply RGB shift only if significant (skip for minimal values)
  if (rgbShift > 0.005) {
    float shift = rgbShift * RGB_SHIFT_SCALE;
    pixel.r += texture(uTexture, vec2(uv.x + shift, uv.y)).r * RGB_SHIFT_INTENSITY;
    pixel.b += texture(uTexture, vec2(uv.x - shift, uv.y)).b * RGB_SHIFT_INTENSITY;
  }

  // Apply brightness
  pixel.rgb *= brightness;

  // Apply contrast and saturation in one pass
  float luminance = dot(pixel.rgb, LUMA);
  pixel.rgb = (pixel.rgb - 0.5) * contrast + 0.5;
  pixel.rgb = mix(vec3(luminance), pixel.rgb, saturation);

  // Calculate combined lighting mask (scanlines, flicker, vignette)
  float lightingMask = 1.0;

  if (scanlineIntensity > 0.001) {
    float scanlineY = (uv.y + yOffset) * scanlineCount;
    float scanlinePattern = abs(sin(scanlineY * PI));

    float adaptiveFactor = 1.0;
    if (adaptiveIntensity > 0.001) {
      float yPattern = sin(uv.y * 30.0) * 0.5 + 0.5;
      adaptiveFactor = 1.0 - yPattern * adaptiveIntensity * 0.2;
    }

    lightingMask *= 1.0 - scanlinePattern * scanlineIntensity * adaptiveFactor;
  }

  if (flickerStrength > 0.001) {
    lightingMask *= 1.0 + sin(time * 110.0) * flickerStrength;
  }

  if (vignetteStrength > 0.001) {
    lightingMask *= vignetteApprox(uv, vignetteStrength);
  }

  pixel.rgb *= lightingMask;

  fragColor = pixel;
}

void main() {
  if (!uEnabled) {
    bypass();
    return;
  }
  mainImage();
}
`;
