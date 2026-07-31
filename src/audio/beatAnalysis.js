const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const quantile = (values, amount) => {
  if (values.length === 0) return 0;

  const sorted = [...values].sort((a, b) => a - b);
  const index = (sorted.length - 1) * amount;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const mix = index - lower;

  return sorted[lower] * (1 - mix) + sorted[upper] * mix;
};

const renderBand = async (buffer, minimumHz, maximumHz) => {
  const OfflineContext =
    window.OfflineAudioContext || window.webkitOfflineAudioContext;

  if (!OfflineContext) return buffer;

  const context = new OfflineContext(1, buffer.length, buffer.sampleRate);
  const source = context.createBufferSource();
  const highPass = context.createBiquadFilter();
  const lowPass = context.createBiquadFilter();

  source.buffer = buffer;
  highPass.type = "highpass";
  highPass.frequency.value = minimumHz;
  highPass.Q.value = 0.707;
  lowPass.type = "lowpass";
  lowPass.frequency.value = maximumHz;
  lowPass.Q.value = 0.707;

  source.connect(highPass).connect(lowPass).connect(context.destination);
  source.start(0);

  return context.startRendering();
};

const detectBandOnsets = async (
  audioBuffer,
  {
    type,
    minimumHz,
    maximumHz,
    frameSize,
    hopSize = 256,
    sensitivity,
    energyQuantile,
    minimumInterval,
    strengthScale = 1,
  }
) => {
  const bandBuffer = await renderBand(audioBuffer, minimumHz, maximumHz);
  const data = bandBuffer.getChannelData(0);
  const sampleRate = bandBuffer.sampleRate;
  const frameCount = Math.max(
    0,
    Math.floor((data.length - frameSize) / hopSize) + 1
  );
  const energy = new Float32Array(frameCount);
  const novelty = new Float32Array(frameCount);

  for (let frame = 0; frame < frameCount; frame += 1) {
    const start = frame * hopSize;
    let sumSquares = 0;

    for (let offset = 0; offset < frameSize; offset += 1) {
      const sample = data[start + offset];
      sumSquares += sample * sample;
    }

    energy[frame] = Math.log1p(Math.sqrt(sumSquares / frameSize) * 80);
  }

  for (let frame = 4; frame < frameCount; frame += 1) {
    const recentEnergy =
      (energy[frame - 1] +
        energy[frame - 2] +
        energy[frame - 3] +
        energy[frame - 4]) /
      4;
    novelty[frame] = Math.max(0, energy[frame] - recentEnergy);
  }

  const historyFrames = Math.max(12, Math.round(sampleRate / hopSize));
  const globalFloor = quantile(Array.from(novelty), 0.64) * 0.5;
  const energyFloor = quantile(Array.from(energy), energyQuantile);
  const rawOnsets = [];
  let historySum = 0;
  let historySquares = 0;

  for (let frame = 0; frame < frameCount; frame += 1) {
    const historyStart = frame - historyFrames;

    if (frame > 0) {
      const added = novelty[frame - 1];
      historySum += added;
      historySquares += added * added;
    }

    if (historyStart > 0) {
      const removed = novelty[historyStart - 1];
      historySum -= removed;
      historySquares -= removed * removed;
    }

    const historyLength = Math.min(frame, historyFrames);
    if (historyLength < 8) continue;

    const mean = historySum / historyLength;
    const variance = Math.max(
      0,
      historySquares / historyLength - mean * mean
    );
    const deviation = Math.sqrt(variance);
    const threshold = Math.max(globalFloor, mean + deviation * sensitivity);
    const value = novelty[frame];
    const isLocalMaximum =
      value >= (novelty[frame - 1] || 0) &&
      value > (novelty[frame + 1] || 0) &&
      value >= (novelty[frame - 2] || 0) &&
      value > (novelty[frame + 2] || 0);

    if (
      isLocalMaximum &&
      value > threshold &&
      energy[frame] > energyFloor
    ) {
      rawOnsets.push({
        type,
        time: (frame * hopSize + frameSize * 0.5) / sampleRate,
        rawStrength: (value / Math.max(threshold, 0.0001)) * strengthScale,
      });
    }
  }

  const separated = [];

  for (const onset of rawOnsets) {
    const previous = separated.at(-1);

    if (!previous || onset.time - previous.time >= minimumInterval) {
      separated.push(onset);
    } else if (onset.rawStrength > previous.rawStrength) {
      separated[separated.length - 1] = onset;
    }
  }

  const strengths = separated.map((onset) => onset.rawStrength);
  const weak = quantile(strengths, 0.18);
  const strong = Math.max(weak + 0.001, quantile(strengths, 0.92));

  return {
    onsets: separated.map(({ time, rawStrength }) => ({
      type,
      time,
      strength:
        0.32 + clamp((rawStrength - weak) / (strong - weak), 0, 1) * 0.68,
    })),
    novelty,
    sampleRate,
    hopSize,
    frameSize,
  };
};

const mergePercussion = (kickOnsets, clapOnsets) => {
  const all = [...kickOnsets, ...clapOnsets].sort((a, b) => a.time - b.time);
  const merged = [];
  const mergeWindow = 0.075;

  for (const onset of all) {
    const previous = merged.at(-1);

    if (!previous || onset.time - previous.time > mergeWindow) {
      merged.push({ ...onset });
      continue;
    }

    previous.type = previous.type === onset.type ? previous.type : "both";
    if (onset.strength > previous.strength) previous.time = onset.time;
    previous.strength = Math.max(previous.strength, onset.strength);
  }

  return merged;
};

const TEMPO_FPS = 100;
const MINIMUM_BPM = 50;
const MAXIMUM_BPM = 210;
const BPM_STEP = 0.5;

const readLinear = (values, position) => {
  if (values.length === 0) return 0;

  const clampedPosition = clamp(position, 0, values.length - 1);
  const lower = Math.floor(clampedPosition);
  const upper = Math.min(values.length - 1, lower + 1);
  const mix = clampedPosition - lower;
  return values[lower] * (1 - mix) + values[upper] * mix;
};

const createNormalizedEnvelope = (analysis, duration) => {
  const targetLength = Math.max(1, Math.ceil(duration * TEMPO_FPS));
  const envelope = new Float32Array(targetLength);
  const noveltyValues = Array.from(analysis.novelty);
  const floor = quantile(noveltyValues, 0.55);
  const peak = Math.max(floor + 0.0001, quantile(noveltyValues, 0.965));
  const range = peak - floor;

  for (let index = 0; index < targetLength; index += 1) {
    const time = index / TEMPO_FPS;
    const sourceFrame =
      (time * analysis.sampleRate - analysis.frameSize * 0.5) /
      analysis.hopSize;
    const value = readLinear(analysis.novelty, sourceFrame);
    envelope[index] = Math.pow(clamp((value - floor) / range, 0, 1), 0.72);
  }

  const smoothed = new Float32Array(targetLength);
  for (let index = 0; index < targetLength; index += 1) {
    const previous = envelope[Math.max(0, index - 1)];
    const current = envelope[index];
    const next = envelope[Math.min(targetLength - 1, index + 1)];
    smoothed[index] = previous * 0.2 + current * 0.6 + next * 0.2;
  }

  return smoothed;
};

const combineEnvelopes = (duration, kickAnalysis, clapAnalysis, hatAnalysis) => {
  const kick = createNormalizedEnvelope(kickAnalysis, duration);
  const clap = createNormalizedEnvelope(clapAnalysis, duration);
  const hat = createNormalizedEnvelope(hatAnalysis, duration);
  const tempo = new Float32Array(kick.length);
  const percussion = new Float32Array(kick.length);

  for (let index = 0; index < kick.length; index += 1) {
    percussion[index] = clamp(kick[index] * 0.62 + clap[index] * 0.38, 0, 1);
    tempo[index] = clamp(
      kick[index] * 0.48 + clap[index] * 0.34 + hat[index] * 0.18,
      0,
      1
    );
  }

  return { kick, clap, hat, percussion, tempo };
};

const normalizedAutocorrelation = (envelope, start, end, lag) => {
  const firstIndex = Math.max(start, start + Math.ceil(lag));
  if (end - firstIndex < TEMPO_FPS * 1.5) return 0;

  let product = 0;
  let currentSquares = 0;
  let delayedSquares = 0;

  for (let index = firstIndex; index < end; index += 1) {
    const current = envelope[index];
    const delayed = readLinear(envelope, index - lag);
    product += current * delayed;
    currentSquares += current * current;
    delayedSquares += delayed * delayed;
  }

  const denominator = Math.sqrt(currentSquares * delayedSquares);
  return denominator > 0.000001 ? product / denominator : 0;
};

const scorePeriodicity = (envelope, start, end, bpm) => {
  const lag = (60 * TEMPO_FPS) / bpm;
  const primary = normalizedAutocorrelation(envelope, start, end, lag);
  const secondBeat = normalizedAutocorrelation(envelope, start, end, lag * 2);
  const thirdBeat = normalizedAutocorrelation(envelope, start, end, lag * 3);
  const subdivision = normalizedAutocorrelation(envelope, start, end, lag * 0.5);

  return clamp(
    primary * 0.58 +
      secondBeat * 0.25 +
      thirdBeat * 0.11 +
      subdivision * 0.06,
    0,
    1
  );
};

const getOnsetWeight = (onset) => {
  if (onset.type === "kick") return onset.strength;
  if (onset.type === "both") return onset.strength * 1.08;
  if (onset.type === "clap") return onset.strength * 0.86;
  return onset.strength * 0.28;
};

const scoreBeatGrid = (onsets, startTime, endTime, bpm) => {
  if (onsets.length < 3 || !bpm) return 0;

  const period = 60 / bpm;
  const phaseSteps = 24;
  const expectedBeats = Math.max(1, (endTime - startTime) / period);
  const tolerance = Math.min(0.09, period * 0.15);
  let totalWeight = 0;

  onsets.forEach((onset) => {
    totalWeight += getOnsetWeight(onset);
  });

  let bestScore = 0;

  for (let phaseIndex = 0; phaseIndex < phaseSteps; phaseIndex += 1) {
    const phase = (phaseIndex / phaseSteps) * period;
    let alignedWeight = 0;

    onsets.forEach((onset) => {
      const cycles = (onset.time - phase) / period;
      const distance = Math.abs(cycles - Math.round(cycles)) * period;
      const alignment = Math.exp(-0.5 * Math.pow(distance / tolerance, 2));
      alignedWeight += getOnsetWeight(onset) * alignment;
    });

    const coverage = alignedWeight / Math.max(totalWeight, 0.0001);
    const occupancy = clamp(alignedWeight / Math.max(expectedBeats * 0.68, 1), 0, 1);
    bestScore = Math.max(bestScore, coverage * 0.64 + occupancy * 0.36);
  }

  return bestScore;
};

const createTempoWindows = (duration) => {
  if (duration <= 0) return [];

  const windowDuration = Math.min(14, duration);
  const hopDuration = Math.max(3, windowDuration * 0.5);
  const windows = [];

  for (
    let start = 0;
    start <= Math.max(0, duration - windowDuration) + 0.001;
    start += hopDuration
  ) {
    windows.push({ start, end: Math.min(duration, start + windowDuration) });
  }

  const finalStart = Math.max(0, duration - windowDuration);
  if (!windows.length || Math.abs(windows.at(-1).start - finalStart) > 0.25) {
    windows.push({ start: finalStart, end: duration });
  }

  return windows;
};

const bpmToIndex = (bpm) => (bpm - MINIMUM_BPM) / BPM_STEP;
const indexToBpm = (index) => MINIMUM_BPM + index * BPM_STEP;

const scoreAtBpm = (scores, bpm) => {
  if (bpm < MINIMUM_BPM || bpm > MAXIMUM_BPM) return 0;
  return readLinear(scores, bpmToIndex(bpm));
};

const tempoFamilyDistance = (first, second) =>
  Math.min(
    Math.abs(first - second),
    Math.abs(first * 2 - second),
    Math.abs(first - second * 2)
  );

const estimateBeatPhase = (onsets, bpm, duration) => {
  if (!bpm || onsets.length < 2) return 0;

  const period = 60 / bpm;
  const phaseSteps = 96;
  const tolerance = Math.min(0.08, period * 0.13);
  const usableOnsets = onsets.filter(
    (onset) => onset.time >= 0 && onset.time <= duration
  );
  let bestPhase = 0;
  let bestScore = -Infinity;

  for (let phaseIndex = 0; phaseIndex < phaseSteps; phaseIndex += 1) {
    const phase = (phaseIndex / phaseSteps) * period;
    let score = 0;

    usableOnsets.forEach((onset) => {
      const cycles = (onset.time - phase) / period;
      const distance = Math.abs(cycles - Math.round(cycles)) * period;
      score +=
        getOnsetWeight(onset) *
        Math.exp(-0.5 * Math.pow(distance / tolerance, 2));
    });

    if (score > bestScore) {
      bestScore = score;
      bestPhase = phase;
    }
  }

  return bestPhase;
};

const emptyTempoResult = () => ({
  bpm: null,
  musicalBpm: null,
  visualBpm: null,
  beatOffset: 0,
  visualBeatOffset: 0,
  confidence: 0,
  stability: 0,
  candidates: [],
  halfTimeBpm: null,
  doubleTimeBpm: null,
});

const estimateTempo = ({
  duration,
  kickAnalysis,
  clapAnalysis,
  hatAnalysis,
  percussionOnsets,
  allOnsets,
}) => {
  if (duration < 3 || percussionOnsets.length < 4) return emptyTempoResult();

  const envelopes = combineEnvelopes(
    duration,
    kickAnalysis,
    clapAnalysis,
    hatAnalysis
  );
  const candidateCount =
    Math.round((MAXIMUM_BPM - MINIMUM_BPM) / BPM_STEP) + 1;
  const aggregateScores = new Float32Array(candidateCount);
  const localResults = [];
  const windows = createTempoWindows(duration);
  let totalWindowWeight = 0;
  let activitySum = 0;

  windows.forEach(({ start, end }) => {
    const startFrame = Math.max(0, Math.floor(start * TEMPO_FPS));
    const endFrame = Math.min(
      envelopes.tempo.length,
      Math.ceil(end * TEMPO_FPS)
    );
    const windowOnsets = percussionOnsets.filter(
      (onset) => onset.time >= start && onset.time < end
    );
    let envelopeSquares = 0;

    for (let index = startFrame; index < endFrame; index += 1) {
      envelopeSquares += envelopes.tempo[index] * envelopes.tempo[index];
    }

    const rms = Math.sqrt(
      envelopeSquares / Math.max(1, endFrame - startFrame)
    );
    const onsetActivity = clamp(
      windowOnsets.length / Math.max((end - start) * 2.2, 1),
      0,
      1
    );
    const activity = clamp(rms * 2.2 + onsetActivity * 0.45, 0, 1);
    if (windowOnsets.length < 3 || activity < 0.075) return;

    const windowScores = new Float32Array(candidateCount);
    let localBestIndex = 0;
    let localBestScore = 0;

    for (let index = 0; index < candidateCount; index += 1) {
      const bpm = indexToBpm(index);
      const periodicity = scorePeriodicity(
        envelopes.tempo,
        startFrame,
        endFrame,
        bpm
      );
      const grid = scoreBeatGrid(windowOnsets, start, end, bpm);
      const broadPrior =
        0.97 + 0.03 * Math.exp(-Math.pow((bpm - 112) / 68, 2));
      const score = (periodicity * 0.5 + grid * 0.5) * broadPrior;
      windowScores[index] = score;

      if (score > localBestScore) {
        localBestScore = score;
        localBestIndex = index;
      }
    }

    const windowWeight = activity * (0.55 + localBestScore * 0.45);
    for (let index = 0; index < candidateCount; index += 1) {
      aggregateScores[index] += windowScores[index] * windowWeight;
    }

    totalWindowWeight += windowWeight;
    activitySum += activity;
    localResults.push({
      bpm: indexToBpm(localBestIndex),
      score: localBestScore,
      weight: windowWeight,
    });
  });

  if (!localResults.length || totalWindowWeight <= 0) return emptyTempoResult();

  const averagedScores = new Float32Array(candidateCount);
  for (let index = 0; index < candidateCount; index += 1) {
    averagedScores[index] = aggregateScores[index] / totalWindowWeight;
  }

  const smoothedScores = new Float32Array(candidateCount);
  for (let index = 0; index < candidateCount; index += 1) {
    smoothedScores[index] =
      averagedScores[index] * 0.4 +
      (averagedScores[index - 1] || 0) * 0.22 +
      (averagedScores[index + 1] || 0) * 0.22 +
      (averagedScores[index - 2] || 0) * 0.08 +
      (averagedScores[index + 2] || 0) * 0.08;
  }

  const peaks = [];
  for (let index = 1; index < candidateCount - 1; index += 1) {
    const score = smoothedScores[index];
    if (
      score >= smoothedScores[index - 1] &&
      score > smoothedScores[index + 1]
    ) {
      peaks.push({ bpm: indexToBpm(index), score });
    }
  }
  peaks.sort((first, second) => second.score - first.score);

  const distinctPeaks = [];
  peaks.forEach((peak) => {
    if (
      distinctPeaks.length < 8 &&
      distinctPeaks.every((existing) => Math.abs(existing.bpm - peak.bpm) >= 3)
    ) {
      distinctPeaks.push(peak);
    }
  });

  const rawBest = distinctPeaks[0];
  if (!rawBest || rawBest.score <= 0) return emptyTempoResult();

  let musicalBpm = rawBest.bpm;
  const rawHalf = rawBest.bpm / 2;
  const rawDouble = rawBest.bpm * 2;

  if (rawBest.bpm >= 118 && rawHalf >= MINIMUM_BPM) {
    const halfRatio = scoreAtBpm(smoothedScores, rawHalf) / rawBest.score;
    const threshold = rawBest.bpm >= 160 ? 0.93 : 0.82;
    if (halfRatio >= threshold) musicalBpm = rawHalf;
  } else if (rawBest.bpm <= 66 && rawDouble <= MAXIMUM_BPM) {
    const doubleRatio = scoreAtBpm(smoothedScores, rawDouble) / rawBest.score;
    if (doubleRatio >= 0.9) musicalBpm = rawDouble;
  }

  musicalBpm = Math.round(musicalBpm / BPM_STEP) * BPM_STEP;
  const musicalScore = scoreAtBpm(smoothedScores, musicalBpm);
  const doubleBpm = musicalBpm * 2;
  const halfBpm = musicalBpm / 2;
  const doubleScore = scoreAtBpm(smoothedScores, doubleBpm);
  const halfScore = scoreAtBpm(smoothedScores, halfBpm);
  const hatDoubleSupport =
    doubleBpm <= MAXIMUM_BPM
      ? scorePeriodicity(
          envelopes.hat,
          0,
          envelopes.hat.length,
          doubleBpm
        )
      : 0;
  const visualBpm =
    musicalBpm < 90 &&
    doubleBpm <= MAXIMUM_BPM &&
    (doubleScore >= musicalScore * 0.68 || hatDoubleSupport >= 0.3)
      ? doubleBpm
      : musicalBpm;

  const selectedAlternatives = distinctPeaks.filter(
    (candidate) => Math.abs(candidate.bpm - musicalBpm) >= 3
  );
  const strongestAlternative = selectedAlternatives[0]?.score || 0;
  const contrast = musicalScore
    ? clamp((musicalScore - strongestAlternative) / musicalScore, 0, 1)
    : 0;
  const agreementWeight = localResults.reduce(
    (sum, result) =>
      sum +
      (tempoFamilyDistance(result.bpm, musicalBpm) <= 3 ? result.weight : 0),
    0
  );
  const stability = clamp(agreementWeight / totalWindowWeight, 0, 1);
  const averageActivity = activitySum / localResults.length;
  const octaveRival = Math.max(halfScore, doubleScore);
  const octaveAmbiguity = musicalScore
    ? clamp(octaveRival / musicalScore, 0, 1.2)
    : 1;
  let confidence = clamp(
    0.08 + contrast * 0.4 + stability * 0.34 + averageActivity * 0.18,
    0,
    1
  );
  if (octaveAmbiguity > 0.78) {
    confidence *= clamp(1 - (octaveAmbiguity - 0.78) * 0.9, 0.62, 1);
  }

  const beatOffset = estimateBeatPhase(
    percussionOnsets,
    musicalBpm,
    duration
  );
  const visualBeatOffset = estimateBeatPhase(allOnsets, visualBpm, duration);
  const candidateMaximum = rawBest.score;
  const candidates = [];

  const addCandidate = (bpm, score) => {
    if (
      bpm >= MINIMUM_BPM &&
      bpm <= MAXIMUM_BPM &&
      candidates.every((candidate) => Math.abs(candidate.bpm - bpm) >= 2)
    ) {
      candidates.push({
        bpm: Math.round(bpm / BPM_STEP) * BPM_STEP,
        score: candidateMaximum ? clamp(score / candidateMaximum, 0, 1) : 0,
      });
    }
  };

  addCandidate(musicalBpm, musicalScore);
  distinctPeaks.forEach((candidate) =>
    addCandidate(candidate.bpm, candidate.score)
  );

  return {
    bpm: musicalBpm,
    musicalBpm,
    visualBpm,
    beatOffset,
    visualBeatOffset,
    confidence,
    stability,
    candidates: candidates.slice(0, 6),
    halfTimeBpm: halfBpm >= 45 ? halfBpm : null,
    doubleTimeBpm: doubleBpm <= 220 ? doubleBpm : null,
  };
};

export const analyzePercussionOnsets = async (audioBuffer) => {
  const [kickAnalysis, clapAnalysis] = await Promise.all([
    detectBandOnsets(audioBuffer, {
      type: "kick",
      minimumHz: 35,
      maximumHz: 190,
      frameSize: 1024,
      sensitivity: 1.25,
      energyQuantile: 0.34,
      minimumInterval: 0.14,
    }),
    detectBandOnsets(audioBuffer, {
      type: "clap",
      minimumHz: 750,
      maximumHz: 5200,
      frameSize: 512,
      sensitivity: 1.62,
      energyQuantile: 0.52,
      minimumInterval: 0.16,
      strengthScale: 0.88,
    }),
  ]);
  const hatAnalysis = await detectBandOnsets(audioBuffer, {
    type: "hat",
    minimumHz: 4000,
    maximumHz: 12000,
    frameSize: 256,
    sensitivity: 1.48,
    energyQuantile: 0.48,
    minimumInterval: 0.065,
    strengthScale: 0.72,
  });
  const kickOnsets = kickAnalysis.onsets;
  const clapOnsets = clapAnalysis.onsets;
  const hatOnsets = hatAnalysis.onsets;
  const percussionOnsets = mergePercussion(kickOnsets, clapOnsets);
  const onsets = [...percussionOnsets, ...hatOnsets].sort(
    (a, b) => a.time - b.time
  );
  const tempo = estimateTempo({
    duration: audioBuffer.duration,
    kickAnalysis,
    clapAnalysis,
    hatAnalysis,
    percussionOnsets,
    allOnsets: onsets,
  });

  return {
    duration: audioBuffer.duration,
    bpm: tempo.bpm,
    musicalBpm: tempo.musicalBpm,
    visualBpm: tempo.visualBpm,
    beatOffset: tempo.beatOffset,
    visualBeatOffset: tempo.visualBeatOffset,
    bpmConfidence: tempo.confidence,
    tempoStability: tempo.stability,
    bpmCandidates: tempo.candidates,
    halfTimeBpm: tempo.halfTimeBpm,
    doubleTimeBpm: tempo.doubleTimeBpm,
    kickCount: kickOnsets.length,
    clapCount: clapOnsets.length,
    hatCount: hatOnsets.length,
    onsets,
  };
};
