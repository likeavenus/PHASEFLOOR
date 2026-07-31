# PHASEFLOOR

Audio-reactive 3D club built with React Three Fiber and Web Audio API. Load any
local audio file and the crowd, lights, smoke, stage and wall displays respond
to its frequency bands, percussion onsets, BPM and beat phase.

## Development

```bash
npm install
npm run dev
```

Production build:

```bash
npm run build
```

## Audio model

- Sub and bass drive the central object, floor and speaker cones.
- Low mids and presence drive stage fixtures and crowd energy.
- High frequencies and transients drive the light chase.
- Offline multiband onset envelopes estimate musical BPM and beat phase.
- Visual BPM may use double time, while character animation always uses the
  musical tempo with a high-BPM half-time guard.
- Absolute RMS loudness keeps the crowd idle during silent intros.

The default track is `public/music/lostvpe-mentalmane-cryangel.mp3`. Uploaded tracks stay
local to the browser.
