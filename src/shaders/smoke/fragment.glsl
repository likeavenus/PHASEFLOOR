precision highp float;

uniform float uTime;
uniform float uDensity;
uniform float uBeat;
uniform vec3 uCameraLocal;

varying vec3 vLocalPosition;

#ifdef LOW_POWER
  #define MARCH_STEPS 7
#else
  #define MARCH_STEPS 12
#endif

float hash31(vec3 point) {
  point = fract(point * 0.1031);
  point += dot(point, point.yzx + 33.33);
  return fract((point.x + point.y) * point.z);
}

float valueNoise(vec3 point) {
  vec3 cell = floor(point);
  vec3 local = fract(point);
  local = local * local * (3.0 - 2.0 * local);

  float n000 = hash31(cell + vec3(0.0, 0.0, 0.0));
  float n100 = hash31(cell + vec3(1.0, 0.0, 0.0));
  float n010 = hash31(cell + vec3(0.0, 1.0, 0.0));
  float n110 = hash31(cell + vec3(1.0, 1.0, 0.0));
  float n001 = hash31(cell + vec3(0.0, 0.0, 1.0));
  float n101 = hash31(cell + vec3(1.0, 0.0, 1.0));
  float n011 = hash31(cell + vec3(0.0, 1.0, 1.0));
  float n111 = hash31(cell + vec3(1.0, 1.0, 1.0));

  float nx00 = mix(n000, n100, local.x);
  float nx10 = mix(n010, n110, local.x);
  float nx01 = mix(n001, n101, local.x);
  float nx11 = mix(n011, n111, local.x);
  float nxy0 = mix(nx00, nx10, local.y);
  float nxy1 = mix(nx01, nx11, local.y);
  return mix(nxy0, nxy1, local.z);
}

float fbm(vec3 point) {
  float total = 0.0;
  float amplitude = 0.56;

  total += valueNoise(point) * amplitude;
  point = point * 2.03 + vec3(17.1, 9.2, 13.7);
  amplitude *= 0.5;
  total += valueNoise(point) * amplitude;
#ifndef LOW_POWER
  point = point * 2.01 + vec3(8.3, 19.4, 5.6);
  amplitude *= 0.5;
  total += valueNoise(point) * amplitude;
#endif

  return total;
}

vec2 intersectBox(vec3 rayOrigin, vec3 rayDirection) {
  vec3 safeDirection = mix(
    vec3(0.0001),
    rayDirection,
    step(vec3(0.0001), abs(rayDirection))
  );
  vec3 inverseDirection = 1.0 / safeDirection;
  vec3 t0 = (-vec3(0.5) - rayOrigin) * inverseDirection;
  vec3 t1 = (vec3(0.5) - rayOrigin) * inverseDirection;
  vec3 nearPlane = min(t0, t1);
  vec3 farPlane = max(t0, t1);
  float nearDistance = max(max(nearPlane.x, nearPlane.y), nearPlane.z);
  float farDistance = min(min(farPlane.x, farPlane.y), farPlane.z);
  return vec2(nearDistance, farDistance);
}

float smokeDensity(vec3 point) {
  vec3 clubPoint = point * vec3(10.0, 4.5, 8.0);
  float time = uTime * 0.075;

  vec3 flow = vec3(
    time * 0.42 + sin(clubPoint.z * 0.18) * 0.18,
    -time * 0.2,
    time * 0.15
  );
  float broadNoise = fbm(clubPoint * 0.42 + flow);
  float curledNoise = fbm(
    clubPoint * 0.78 +
    vec3(broadNoise * 1.35, -time * 0.7, broadNoise * 0.82)
  );
  float bankNoise = fbm(
    clubPoint * 0.2 + vec3(-time * 0.26, time * 0.08, time * 0.2)
  );

  float height = point.y + 0.5;
  float floorLayer = 1.0 - smoothstep(0.04, 0.88, height);
  float suspendedHaze = 1.0 - smoothstep(0.18, 1.0, height);
  float wisps = smoothstep(0.46, 0.78, broadNoise * 0.62 + curledNoise * 0.58);

  float sideBanks = smoothstep(0.2, 0.48, abs(point.x));
  float rearBank = smoothstep(0.02, 0.47, -point.z);
  float perimeterBank = max(sideBanks, rearBank * 0.62);
  float openDanceFloor = mix(0.12, 1.0, perimeterBank);
  float brokenClouds = mix(
    0.24,
    1.0,
    smoothstep(0.42, 0.68, bankNoise + perimeterBank * 0.12)
  );

  float movingOpening = smoothstep(
    0.16,
    0.42,
    length(
      vec2(
        point.x - sin(time * 0.65) * 0.07,
        point.z - 0.08 - cos(time * 0.48) * 0.06
      )
    )
  );
  float sightline = mix(0.16, 1.0, movingOpening);

  float sideFade = smoothstep(0.0, 0.11, 0.5 - abs(point.x));
  float depthFade = smoothstep(0.0, 0.12, 0.5 - abs(point.z));
  float ceilingFade = smoothstep(0.0, 0.16, 0.5 - point.y);
  float boundaryFade = sideFade * depthFade * ceilingFade;

  float density = wisps * (floorLayer * 0.82 + suspendedHaze * 0.18);
  density += floorLayer * smoothstep(0.56, 0.82, curledNoise) * 0.28;
  float jetDistance = min(
    length(point.xz - vec2(-0.34, 0.2)),
    length(point.xz - vec2(0.34, 0.2))
  );
  float sideJets =
    (1.0 - smoothstep(0.035, 0.14, jetDistance)) *
    (1.0 - smoothstep(0.04, 0.62, height));
  density += sideJets * uBeat * 0.42;
  density *= openDanceFloor * brokenClouds * sightline;
  return density * boundaryFade * uDensity;
}

void main() {
  vec3 rayOrigin = uCameraLocal;
  vec3 rayDirection = normalize(vLocalPosition - rayOrigin);
  vec2 hit = intersectBox(rayOrigin, rayDirection);

  float nearDistance = max(hit.x, 0.0);
  float farDistance = hit.y;
  if (farDistance <= nearDistance) discard;

  float segmentLength = (farDistance - nearDistance) / float(MARCH_STEPS);
  float jitter = hash31(vec3(gl_FragCoord.xy, 7319.0));
  float travel = nearDistance + segmentLength * jitter;
  float accumulatedAlpha = 0.0;
  vec3 accumulatedColor = vec3(0.0);

  for (int stepIndex = 0; stepIndex < MARCH_STEPS; stepIndex++) {
    vec3 point = rayOrigin + rayDirection * travel;
    float density = smokeDensity(point);
    float sampleAlpha = 1.0 - exp(-density * segmentLength * 3.4);

    float horizontal = point.x + 0.5;
    vec3 cyan = vec3(0.17, 0.56, 0.76);
    vec3 violet = vec3(0.48, 0.25, 0.72);
    vec3 magenta = vec3(0.73, 0.19, 0.43);
    vec3 smokeColor = mix(cyan, violet, smoothstep(0.05, 0.58, horizontal));
    smokeColor = mix(smokeColor, magenta, smoothstep(0.58, 0.96, horizontal));
    smokeColor += vec3(0.07, 0.08, 0.1) + uBeat * 0.035;

    float remaining = 1.0 - accumulatedAlpha;
    accumulatedColor += remaining * smokeColor * sampleAlpha;
    accumulatedAlpha += remaining * sampleAlpha;

    if (accumulatedAlpha > 0.82) break;
    travel += segmentLength;
  }

  if (accumulatedAlpha < 0.002) discard;

  vec3 finalColor = accumulatedColor / max(accumulatedAlpha, 0.0001);
  gl_FragColor = vec4(finalColor, accumulatedAlpha * 0.48);
}
