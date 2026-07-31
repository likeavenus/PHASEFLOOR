// #define PI 3.14159265358979

uniform float uTime;
uniform float uAudioFrequency;
uniform float uBeat;
// varying vec2 vUv;
varying float vPattern;


struct Color {
    vec3 c;
    float position;
};

// #define COLOR_RAMP(inputColors, inputPosition, finalColor) { \
//     const int len = inputColors.length(); \
//     int index = 0; \
//     for (int i = 0; i < len - 1; i++) { \
//         Color currentColor = inputColors[i]; \
//         Color nextColor = inputColors[i + 1]; \
//         bool pointExists = currentColor.position <= inputPosition && inputPosition <= nextColor.position; \
//         index = pointExists ? i : index; \
//     } \

//     Color currentColor = inputColors[index]; \
//     Color nextColor = inputColors[index + 1]; \
//     vec3 c1 = currentColor.c; \
//     vec3 c2 = nextColor.c; \
//     float range = nextColor.position = currentColor.position; \
//     float lerpFactor = (inputPosition - currentColor.position) / range; \
//     finalColor = mix(c1, c2, lerpFactor); \
// } \

#define COLOR_RAMP(colors, factor, finalColor) { \
    int index = 0; \
    for(int i = 0; i < colors.length() - 1; i++){ \
       Color currentColor = colors[i]; \
       bool isInBetween = currentColor.position <= factor; \
       index = int(mix(float(index), float(i), float(isInBetween))); \
    } \
    Color currentColor = colors[index]; \
    Color nextColor = colors[index + 1]; \
    float range = nextColor.position - currentColor.position; \
    float lerpFactor = (factor - currentColor.position) / range; \
    finalColor = mix(currentColor.c, nextColor.c, lerpFactor); \
} \

void main() {
    vec3 color;
    float time = uTime * (1.0 + uAudioFrequency * 0.7 + uBeat * 1.5);

    // Color[3] colors = Color[](
    //     Color(vec3(0), 0.0),
    //     Color(vec3(0, 1, 0), 0.5),
    //     Color(vec3(1), 1.0)
    // );
    // vec3 mainColor = vec3(0.1, 0.2, 0.9);
    float colorReaction = clamp(uAudioFrequency * 0.8 + uBeat * 0.65, 0.0, 1.0);
    vec3 mainColor = mix(vec3(0.2, 0.3, 0.9), vec3(0.65, 1.0, 0.35), colorReaction);


    mainColor.r *= 0.9 + sin(time) / 3.2;
    mainColor.g *= 1.1 + cos(time / 2.0) / 2.5;
    mainColor.b *= 0.8 + cos(time / 5.0) / 4.0;

    mainColor.rgb += 0.1 + vec3(0.14, 0.05, 0.18) * uBeat;


    Color[4] colors = Color[](
        Color(vec3(1), 0.0),
        Color(vec3(1), 0.01),
        Color(mainColor, 0.1),
        Color(vec3(0.01, 0.05, 0.2), 1.0)
    );

    COLOR_RAMP(colors, vPattern, color);

    gl_FragColor = vec4(color, 1.0);
}
