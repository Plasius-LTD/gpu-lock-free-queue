const logEl = document.getElementById("log");
const fpsEl = document.getElementById("fps");
const spectrogramCanvases = Array.from(document.querySelectorAll(".spectrogram"));
const progressLabels = Array.from(document.querySelectorAll(".spectrogram-progress"));
const searchParams = new URLSearchParams(window.location.search);
const testMode = searchParams.get("mode") === "pattern";
const totalFrames = 500;
const renderContinuously = true;
const lineStride = 37;
const lineOffset = 11;
const progressByIndex = new Map();

function isProbablyHtml(text) {
  const trimmed = text.trimStart().slice(0, 20).toLowerCase();
  return trimmed.startsWith("<!doctype html") || trimmed.startsWith("<html");
}

async function loadQueueWgsl() {
  const candidates = [
    new URL("./queue.wgsl", import.meta.url),
    new URL("../src/queue.wgsl", import.meta.url),
    new URL("../dist/queue.wgsl", import.meta.url),
  ];
  const errors = [];

  for (const url of candidates) {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        errors.push(`${url}: ${response.status} ${response.statusText}`.trim());
        continue;
      }
      const text = await response.text();
      if (isProbablyHtml(text)) {
        errors.push(`${url}: received HTML instead of WGSL`);
        continue;
      }
      return text;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push(`${url}: ${message}`);
    }
  }

  throw new Error(`Failed to load WGSL. ${errors.join(" | ")}`);
}

for (const label of progressLabels) {
  const index = Number.parseInt(label.dataset.index ?? "", 10);
  if (Number.isFinite(index)) {
    progressByIndex.set(index, label);
  }
}

function formatFrameCount(value) {
  const count = Math.max(0, Math.floor(value));
  return `${count} frame${count === 1 ? "" : "s"}`;
}

function setProgress(index, value) {
  const label = progressByIndex.get(index);
  if (!label) {
    return;
  }
  if (renderContinuously) {
    label.textContent = formatFrameCount(value);
    return;
  }
  const clamped = Math.max(0, Math.min(1, value));
  const frameCount = Math.round(clamped * totalFrames);
  label.textContent = `${frameCount}/${totalFrames}`;
}

function startFpsCounter() {
  if (!fpsEl || typeof requestAnimationFrame === "undefined") {
    return;
  }
  let frames = 0;
  let lastReport = performance.now();

  const tick = (now) => {
    frames += 1;
    const elapsed = now - lastReport;
    if (elapsed >= 500) {
      const fps = (frames * 1000) / elapsed;
      fpsEl.textContent = fps.toFixed(1);
      frames = 0;
      lastReport = now;
    }
    requestAnimationFrame(tick);
  };

  requestAnimationFrame(tick);
}

function formatTimestamp(date) {
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  return `${hours}:${minutes}:${seconds}`;
}

function logLine(line) {
  const stamp = formatTimestamp(new Date());
  logEl.textContent += `[${stamp}] ${line}\n`;
}

function getLineIndex(frame, imageIndex, lineCount) {
  return (frame * lineStride + imageIndex * lineOffset) % lineCount;
}

if (spectrogramCanvases.length === 0) {
  throw new Error("No spectrogram canvases found.");
}

function fillRandomU32(target) {
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    const maxBytes = 65536;
    const maxWords = maxBytes / 4;
    for (let i = 0; i < target.length; i += maxWords) {
      const slice = target.subarray(i, Math.min(i + maxWords, target.length));
      crypto.getRandomValues(slice);
    }
  } else {
    for (let i = 0; i < target.length; i += 1) {
      target[i] = Math.floor(Math.random() * 0xffffffff);
    }
  }
}

function seedLineBuffer(target, seed) {
  const base = seed >>> 0;
  for (let i = 0; i < target.length; i += 1) {
    target[i] = (target[i] ^ (base + i)) >>> 0;
  }
}

function getFrameSeed(frameIndex, imageIndex) {
  const imageSalt = Math.imul(imageIndex + 1, 0x9e3779b1);
  const frameSalt = Math.imul(frameIndex + 1, 0x85ebca6b);
  return (imageSalt ^ frameSalt) >>> 0;
}

function u32ToFloat01(value) {
  return value / 0xffffffff;
}

function u32ToFloatSigned(value) {
  return u32ToFloat01(value) * 2 - 1;
}

function fftInPlace(re, im) {
  const n = re.length;
  for (let i = 0, j = 0; i < n; i += 1) {
    if (i < j) {
      const tr = re[i];
      const ti = im[i];
      re[i] = re[j];
      im[i] = im[j];
      re[j] = tr;
      im[j] = ti;
    }
    let m = n >> 1;
    while (j >= m && m > 0) {
      j -= m;
      m >>= 1;
    }
    j += m;
  }

  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const half = len >> 1;
    for (let i = 0; i < n; i += len) {
      for (let j = 0; j < half; j += 1) {
        const phase = ang * j;
        const wre = Math.cos(phase);
        const wim = Math.sin(phase);
        const r = re[i + j + half];
        const imv = im[i + j + half];
        const tre = wre * r - wim * imv;
        const tim = wre * imv + wim * r;
        re[i + j + half] = re[i + j] - tre;
        im[i + j + half] = im[i + j] - tim;
        re[i + j] += tre;
        im[i + j] += tim;
      }
    }
  }
}

function makeSpectrogram(samples, windowSize, hop) {
  const bins = windowSize >> 1;
  const frames = Math.max(1, Math.floor((samples.length - windowSize) / hop) + 1);
  const spec = new Float32Array(frames * bins);
  const window = new Float32Array(windowSize);
  for (let i = 0; i < windowSize; i += 1) {
    window[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (windowSize - 1));
  }

  let maxMag = 0;
  for (let f = 0; f < frames; f += 1) {
    const offset = f * hop;
    const re = new Float32Array(windowSize);
    const im = new Float32Array(windowSize);
    for (let i = 0; i < windowSize; i += 1) {
      re[i] = (samples[offset + i] || 0) * window[i];
    }
    fftInPlace(re, im);
    for (let b = 0; b < bins; b += 1) {
      const mag = Math.hypot(re[b], im[b]);
      const logMag = Math.log1p(mag);
      spec[f * bins + b] = logMag;
      if (logMag > maxMag) {
        maxMag = logMag;
      }
    }
  }

  return { spec, frames, bins, maxMag };
}

function drawStaticLine(targetCanvas, lineIndex, output, status, fallback, payloadStride) {
  const ctx = targetCanvas.getContext("2d");
  if (!ctx) {
    return;
  }
  const width = targetCanvas.width;
  const img = ctx.createImageData(width, 1);
  const data = img.data;
  for (let x = 0; x < width; x += 1) {
    const base = x * payloadStride;
    const value = status[x] === 1 ? output[base] : fallback[base];
    const color = colorMap(u32ToFloat01(value));
    const idx = x * 4;
    data[idx] = color[0];
    data[idx + 1] = color[1];
    data[idx + 2] = color[2];
    data[idx + 3] = 255;
  }
  ctx.putImageData(img, 0, lineIndex);
}

function colorMap(v) {
  const t = Math.min(1, Math.max(0, v));
  const r = Math.floor(255 * Math.min(1, Math.max(0, 1.5 * t)));
  const g = Math.floor(255 * Math.min(1, Math.max(0, 1.5 * (t - 0.2))));
  const b = Math.floor(255 * Math.min(1, Math.max(0, 1.5 * (t - 0.5))));
  return [r, g, b];
}

function getTestSeed() {
  const seedParam = Number.parseInt(searchParams.get("seed") ?? "23", 10);
  if (!Number.isFinite(seedParam)) {
    return 23;
  }
  return seedParam & 255;
}

function renderTestPattern(targetCanvas, seed) {
  const ctx = targetCanvas.getContext("2d");
  if (!ctx) {
    return;
  }
  const width = targetCanvas.width;
  const height = targetCanvas.height;
  const img = ctx.createImageData(width, height);
  const data = img.data;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const value =
        (x * (seed + 7) + y * (seed + 13) + ((x ^ y) * (seed + 3))) & 255;
      const t = value / 255;
      const color = colorMap(t);
      const idx = (y * width + x) * 4;
      data[idx] = color[0];
      data[idx + 1] = color[1];
      data[idx + 2] = color[2];
      data[idx + 3] = 255;
    }
  }

  ctx.putImageData(img, 0, 0);
}

function renderTestPatterns(seed) {
  spectrogramCanvases.forEach((targetCanvas, index) => {
    renderTestPattern(targetCanvas, (seed + index) & 255);
    setProgress(index, 1);
  });
  logLine(`Deterministic test images ready (seed ${seed}).`);
  window.__testImageReady = true;
}

function analyzeRandomness(samples, spectrumAvg) {
  const n = samples.length;
  let mean = 0;
  for (let i = 0; i < n; i += 1) {
    mean += samples[i];
  }
  mean /= n;

  let variance = 0;
  for (let i = 0; i < n; i += 1) {
    const d = samples[i] - mean;
    variance += d * d;
  }
  variance /= n;

  let autocorr = 0;
  let denom = 0;
  for (let i = 0; i < n - 1; i += 1) {
    autocorr += (samples[i] - mean) * (samples[i + 1] - mean);
    denom += (samples[i] - mean) * (samples[i] - mean);
  }
  autocorr = denom > 0 ? autocorr / denom : 0;

  let geoSum = 0;
  let arithSum = 0;
  for (let i = 0; i < spectrumAvg.length; i += 1) {
    const v = spectrumAvg[i] + 1e-12;
    geoSum += Math.log(v);
    arithSum += v;
  }
  const geoMean = Math.exp(geoSum / spectrumAvg.length);
  const arithMean = arithSum / spectrumAvg.length;
  const flatness = arithMean > 0 ? geoMean / arithMean : 0;

  let spectrumMean = 0;
  for (let i = 0; i < spectrumAvg.length; i += 1) {
    spectrumMean += spectrumAvg[i];
  }
  spectrumMean /= spectrumAvg.length;
  let spectrumVar = 0;
  for (let i = 0; i < spectrumAvg.length; i += 1) {
    const d = spectrumAvg[i] - spectrumMean;
    spectrumVar += d * d;
  }
  spectrumVar /= spectrumAvg.length;
  const spectrumCv = spectrumMean > 0 ? Math.sqrt(spectrumVar) / spectrumMean : 0;

  return { mean, variance, autocorr, flatness, spectrumCv };
}

async function init() {
  startFpsCounter();
  if (testMode) {
    renderTestPatterns(getTestSeed());
    return;
  }
  if (!navigator.gpu) {
    logLine("WebGPU not available in this browser.");
    return;
  }

  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) {
    logLine("No suitable GPU adapter found.");
    return;
  }

  const device = await adapter.requestDevice();
  const shaderCode = await loadQueueWgsl();
  const module = device.createShaderModule({ code: shaderCode });
  const info = await module.getCompilationInfo();
  if (info.messages.length) {
    info.messages.forEach((msg) => {
      logLine(`WGSL ${msg.type}: ${msg.message}`);
    });
  }

  const bindGroupLayout = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
      { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
      { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
      { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: "read-only-storage" } },
      { binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
      { binding: 5, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
      { binding: 6, visibility: GPUShaderStage.COMPUTE, buffer: { type: "uniform" } },
    ],
  });
  const pipelineLayout = device.createPipelineLayout({ bindGroupLayouts: [bindGroupLayout] });

  const enqueuePipeline = device.createComputePipeline({
    layout: pipelineLayout,
    compute: { module, entryPoint: "enqueue_main" },
  });

  const dequeuePipeline = device.createComputePipeline({
    layout: pipelineLayout,
    compute: { module, entryPoint: "dequeue_main" },
  });

  const imageCount = spectrogramCanvases.length;
  const lineWidth = spectrogramCanvases[0].width;
  const lineCount = spectrogramCanvases[0].height;
  const jobsPerImage = lineWidth;
  const jobCount = jobsPerImage;
  const payloadStride = 1;
  const payloadJobSize = payloadStride * 4;
  const totalJobs = renderContinuously ? null : jobsPerImage * imageCount * totalFrames;
  const capacity = jobCount;
  const mask = capacity - 1;
  if ((capacity & mask) !== 0) {
    throw new Error("capacity must be power of two");
  }
  const queueHeaderSize = 32;
  const slotSize = 16;
  const slotsSize = capacity * slotSize;
  const payloadRingSize = capacity * payloadJobSize;
  const payloadIoSize = jobCount * payloadJobSize;

  const queueBuffers = [];
  const payloadBuffers = [];
  const inputBuffers = [];
  const outputBuffers = [];
  const enqueueStatusBuffers = [];
  const dequeueStatusBuffers = [];
  const enqueueBindGroups = [];
  const dequeueBindGroups = [];
  const readbackOutputs = [];
  const readbackEnqueueStatuses = [];
  const readbackDequeueStatuses = [];

  const queueHeader = new Uint32Array([
    0, // head
    0, // tail
    capacity,
    mask,
    payloadStride,
    0,
    0,
    0,
  ]);

  const slotsInit = new Uint32Array((slotsSize / 4));
  for (let i = 0; i < capacity; i += 1) {
    const base = i * 4;
    slotsInit[base] = i;
    slotsInit[base + 1] = 0;
    slotsInit[base + 2] = 0;
    slotsInit[base + 3] = 0;
  }
  const inputPayloadsByImage = Array.from(
    { length: imageCount },
    () => new Uint32Array(jobCount * payloadStride)
  );
  const paramsData = new Uint32Array([jobCount, 0, 0, 0, 0, 0, 0, 0]);
  const zeroStatus = new Uint32Array(jobCount);
  const enqueuePasses = 8;
  const dequeuePasses = 8;
  const workgroups = Math.ceil(jobCount / 64);

  for (let imageIndex = 0; imageIndex < imageCount; imageIndex += 1) {
    const queueBuffer = device.createBuffer({
      size: queueHeaderSize,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
    });
    const slotsBuffer = device.createBuffer({
      size: slotsSize,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    const payloadBuffer = device.createBuffer({
      size: payloadRingSize,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    const inputBuffer = device.createBuffer({
      size: payloadIoSize,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    const outputBuffer = device.createBuffer({
      size: payloadIoSize,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
    });
    const enqueueStatusBuffer = device.createBuffer({
      size: jobCount * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
    });
    const dequeueStatusBuffer = device.createBuffer({
      size: jobCount * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
    });
    const paramsBuffer = device.createBuffer({
      size: 32,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    device.queue.writeBuffer(queueBuffer, 0, queueHeader);
    device.queue.writeBuffer(slotsBuffer, 0, slotsInit);
    fillRandomU32(inputPayloadsByImage[imageIndex]);
    seedLineBuffer(inputPayloadsByImage[imageIndex], getFrameSeed(0, imageIndex));
    device.queue.writeBuffer(inputBuffer, 0, inputPayloadsByImage[imageIndex]);
    device.queue.writeBuffer(enqueueStatusBuffer, 0, zeroStatus);
    device.queue.writeBuffer(dequeueStatusBuffer, 0, zeroStatus);
    device.queue.writeBuffer(paramsBuffer, 0, paramsData);

    const enqueueBindGroup = device.createBindGroup({
      layout: bindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: queueBuffer } },
        { binding: 1, resource: { buffer: slotsBuffer } },
        { binding: 2, resource: { buffer: payloadBuffer } },
        { binding: 3, resource: { buffer: inputBuffer } },
        { binding: 4, resource: { buffer: outputBuffer } },
        { binding: 5, resource: { buffer: enqueueStatusBuffer } },
        { binding: 6, resource: { buffer: paramsBuffer } },
      ],
    });
    const dequeueBindGroup = device.createBindGroup({
      layout: bindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: queueBuffer } },
        { binding: 1, resource: { buffer: slotsBuffer } },
        { binding: 2, resource: { buffer: payloadBuffer } },
        { binding: 3, resource: { buffer: inputBuffer } },
        { binding: 4, resource: { buffer: outputBuffer } },
        { binding: 5, resource: { buffer: dequeueStatusBuffer } },
        { binding: 6, resource: { buffer: paramsBuffer } },
      ],
    });

    const readbackOutput = device.createBuffer({
      size: payloadIoSize,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });
    const readbackEnqueueStatus = device.createBuffer({
      size: jobCount * 4,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });
    const readbackDequeueStatus = device.createBuffer({
      size: jobCount * 4,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });

    queueBuffers.push(queueBuffer);
    payloadBuffers.push(payloadBuffer);
    inputBuffers.push(inputBuffer);
    outputBuffers.push(outputBuffer);
    enqueueStatusBuffers.push(enqueueStatusBuffer);
    dequeueStatusBuffers.push(dequeueStatusBuffer);
    enqueueBindGroups.push(enqueueBindGroup);
    dequeueBindGroups.push(dequeueBindGroup);
    readbackOutputs.push(readbackOutput);
    readbackEnqueueStatuses.push(readbackEnqueueStatus);
    readbackDequeueStatuses.push(readbackDequeueStatus);
    setProgress(imageIndex, 0);
  }

  spectrogramCanvases.forEach((canvas) => {
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  });

  logLine(
    renderContinuously
      ? `Rendering continuously (${jobsPerImage} jobs per line).`
      : `Rendering ${totalFrames} frames of interleaved static (${jobsPerImage} jobs per line).`
  );
  const renderStart = performance.now();
  let totalEnq = 0;
  let totalDeq = 0;

  for (let frameIndex = 0; ; frameIndex += 1) {
    if (!renderContinuously && frameIndex >= totalFrames) {
      break;
    }
    for (let imageIndex = 0; imageIndex < imageCount; imageIndex += 1) {
      fillRandomU32(inputPayloadsByImage[imageIndex]);
      seedLineBuffer(inputPayloadsByImage[imageIndex], getFrameSeed(frameIndex, imageIndex));
      device.queue.writeBuffer(inputBuffers[imageIndex], 0, inputPayloadsByImage[imageIndex]);
      device.queue.writeBuffer(enqueueStatusBuffers[imageIndex], 0, zeroStatus);
      device.queue.writeBuffer(dequeueStatusBuffers[imageIndex], 0, zeroStatus);
    }

    device.pushErrorScope("validation");
    device.pushErrorScope("out-of-memory");
    const encoder = device.createCommandEncoder();

    for (let passIndex = 0; passIndex < enqueuePasses; passIndex += 1) {
      for (let imageIndex = 0; imageIndex < imageCount; imageIndex += 1) {
        const pass = encoder.beginComputePass();
        pass.setPipeline(enqueuePipeline);
        pass.setBindGroup(0, enqueueBindGroups[imageIndex]);
        pass.dispatchWorkgroups(workgroups);
        pass.end();
      }
    }
    for (let passIndex = 0; passIndex < dequeuePasses; passIndex += 1) {
      for (let imageIndex = 0; imageIndex < imageCount; imageIndex += 1) {
        const pass = encoder.beginComputePass();
        pass.setPipeline(dequeuePipeline);
        pass.setBindGroup(0, dequeueBindGroups[imageIndex]);
        pass.dispatchWorkgroups(workgroups);
        pass.end();
      }
    }

    for (let imageIndex = 0; imageIndex < imageCount; imageIndex += 1) {
      encoder.copyBufferToBuffer(
        outputBuffers[imageIndex],
        0,
        readbackOutputs[imageIndex],
        0,
        payloadIoSize
      );
      encoder.copyBufferToBuffer(
        enqueueStatusBuffers[imageIndex],
        0,
        readbackEnqueueStatuses[imageIndex],
        0,
        jobCount * 4
      );
      encoder.copyBufferToBuffer(
        dequeueStatusBuffers[imageIndex],
        0,
        readbackDequeueStatuses[imageIndex],
        0,
        jobCount * 4
      );
    }

    device.queue.submit([encoder.finish()]);
    await device.queue.onSubmittedWorkDone();
    const oomError = await device.popErrorScope();
    const validationError = await device.popErrorScope();
    if (validationError) {
      logLine(`Frame ${frameIndex + 1}: Validation error: ${validationError.message}`);
    }
    if (oomError) {
      logLine(`Frame ${frameIndex + 1}: OOM error: ${oomError.message}`);
    }

    const mapPromises = [];
    for (let imageIndex = 0; imageIndex < imageCount; imageIndex += 1) {
      mapPromises.push(
        readbackOutputs[imageIndex].mapAsync(GPUMapMode.READ),
        readbackEnqueueStatuses[imageIndex].mapAsync(GPUMapMode.READ),
        readbackDequeueStatuses[imageIndex].mapAsync(GPUMapMode.READ)
      );
    }
    await Promise.all(mapPromises);

    let frameEnq = 0;
    let frameDeq = 0;
    for (let imageIndex = 0; imageIndex < imageCount; imageIndex += 1) {
      const output = new Uint32Array(readbackOutputs[imageIndex].getMappedRange());
      const enqueueStatus = new Uint32Array(
        readbackEnqueueStatuses[imageIndex].getMappedRange()
      );
      const dequeueStatus = new Uint32Array(
        readbackDequeueStatuses[imageIndex].getMappedRange()
      );

      let enqOk = 0;
      for (let i = 0; i < enqueueStatus.length; i += 1) {
        enqOk += enqueueStatus[i];
      }
      let deqOk = 0;
      for (let i = 0; i < dequeueStatus.length; i += 1) {
        deqOk += dequeueStatus[i];
      }

      frameEnq += enqOk;
      frameDeq += deqOk;
      if (!renderContinuously) {
        totalEnq += enqOk;
        totalDeq += deqOk;
      }

      const lineIndex = getLineIndex(frameIndex, imageIndex, lineCount);
      drawStaticLine(
        spectrogramCanvases[imageIndex],
        lineIndex,
        output,
        dequeueStatus,
        inputPayloadsByImage[imageIndex],
        payloadStride
      );

      readbackOutputs[imageIndex].unmap();
      readbackEnqueueStatuses[imageIndex].unmap();
      readbackDequeueStatuses[imageIndex].unmap();
    }

    if (frameIndex === 0) {
      logLine(`Frame 1: Enqueued ${frameEnq} / ${jobsPerImage * imageCount}`);
      logLine(`Frame 1: Dequeued ${frameDeq} / ${jobsPerImage * imageCount}`);
    }

    if (renderContinuously) {
      for (let imageIndex = 0; imageIndex < imageCount; imageIndex += 1) {
        setProgress(imageIndex, frameIndex + 1);
      }
    } else {
      const progress = (frameIndex + 1) / totalFrames;
      for (let imageIndex = 0; imageIndex < imageCount; imageIndex += 1) {
        setProgress(imageIndex, progress);
      }
    }
  }

  if (!renderContinuously) {
    const elapsed = performance.now() - renderStart;
    logLine(`Rendered ${totalFrames} frames in ${Math.round(elapsed)}ms.`);
    logLine(`Total enqueued: ${totalEnq} / ${totalJobs}`);
    logLine(`Total dequeued: ${totalDeq} / ${totalJobs}`);
  }
}

init().catch((err) => {
  logLine(`Error: ${err.message}`);
  console.error(err);
});
