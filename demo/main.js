const logEl = document.getElementById("log");
const canvas = document.getElementById("spectrogram");
const ctx = canvas.getContext("2d");
const searchParams = new URLSearchParams(window.location.search);
const testMode = searchParams.get("mode") === "pattern";

function logLine(line) {
  logEl.textContent += `${line}\n`;
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

function drawSpectrogram(spec, frames, bins, maxMag) {
  const width = canvas.width;
  const height = canvas.height;
  ctx.clearRect(0, 0, width, height);
  const img = ctx.createImageData(width, height);
  const data = img.data;

  for (let x = 0; x < width; x += 1) {
    const frame = Math.floor((x / width) * frames);
    for (let y = 0; y < height; y += 1) {
      const bin = Math.floor(((height - 1 - y) / height) * bins);
      const value = spec[frame * bins + bin] / (maxMag || 1);
      const color = colorMap(value);
      const idx = (y * width + x) * 4;
      data[idx] = color[0];
      data[idx + 1] = color[1];
      data[idx + 2] = color[2];
      data[idx + 3] = 255;
    }
  }

  ctx.putImageData(img, 0, 0);
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

function renderTestPattern(seed) {
  const width = canvas.width;
  const height = canvas.height;
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
  logLine(`Deterministic test image ready (seed ${seed}).`);
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
  if (testMode) {
    renderTestPattern(getTestSeed());
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
  const shaderCode = await fetch("../src/queue.wgsl").then((res) => res.text());
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
      { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: "read-only-storage" } },
      { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
      { binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
      { binding: 5, visibility: GPUShaderStage.COMPUTE, buffer: { type: "uniform" } },
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

  const capacity = 131072;
  const mask = capacity - 1;
  if ((capacity & mask) !== 0) {
    throw new Error("capacity must be power of two");
  }

  const jobCount = 131072;
  const queueHeaderSize = 32;
  const slotSize = 16;
  const slotsSize = capacity * slotSize;

  const queueBuffer = device.createBuffer({
    size: queueHeaderSize,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
  });

  const slotsBuffer = device.createBuffer({
    size: slotsSize,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });

  const inputBuffer = device.createBuffer({
    size: jobCount * 4,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });

  const outputBuffer = device.createBuffer({
    size: jobCount * 4,
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

  const queueHeader = new Uint32Array([
    0, // head
    0, // tail
    capacity,
    mask,
    0,
    0,
    0,
    0,
  ]);
  device.queue.writeBuffer(queueBuffer, 0, queueHeader);

  const slotsInit = new Uint32Array((slotsSize / 4));
  for (let i = 0; i < capacity; i += 1) {
    const base = i * 4;
    slotsInit[base] = i;
    slotsInit[base + 1] = 0;
    slotsInit[base + 2] = 0;
    slotsInit[base + 3] = 0;
  }
  device.queue.writeBuffer(slotsBuffer, 0, slotsInit);

  const inputJobs = new Uint32Array(jobCount);
  fillRandomU32(inputJobs);
  device.queue.writeBuffer(inputBuffer, 0, inputJobs);

  const paramsData = new Uint32Array([jobCount, 0, 0, 0, 0, 0, 0, 0]);
  device.queue.writeBuffer(paramsBuffer, 0, paramsData);

  const enqueueBindGroup = device.createBindGroup({
    layout: bindGroupLayout,
    entries: [
      { binding: 0, resource: { buffer: queueBuffer } },
      { binding: 1, resource: { buffer: slotsBuffer } },
      { binding: 2, resource: { buffer: inputBuffer } },
      { binding: 3, resource: { buffer: outputBuffer } },
      { binding: 4, resource: { buffer: enqueueStatusBuffer } },
      { binding: 5, resource: { buffer: paramsBuffer } },
    ],
  });

  const dequeueBindGroup = device.createBindGroup({
    layout: bindGroupLayout,
    entries: [
      { binding: 0, resource: { buffer: queueBuffer } },
      { binding: 1, resource: { buffer: slotsBuffer } },
      { binding: 2, resource: { buffer: inputBuffer } },
      { binding: 3, resource: { buffer: outputBuffer } },
      { binding: 4, resource: { buffer: dequeueStatusBuffer } },
      { binding: 5, resource: { buffer: paramsBuffer } },
    ],
  });

  device.pushErrorScope("validation");
  device.pushErrorScope("out-of-memory");
  const encoder = device.createCommandEncoder();
  const zeroStatus = new Uint32Array(jobCount);
  device.queue.writeBuffer(enqueueStatusBuffer, 0, zeroStatus);
  device.queue.writeBuffer(dequeueStatusBuffer, 0, zeroStatus);
  const enqueuePasses = 32;
  const dequeuePasses = 32;
  for (let i = 0; i < enqueuePasses; i += 1) {
    const pass = encoder.beginComputePass();
    pass.setPipeline(enqueuePipeline);
    pass.setBindGroup(0, enqueueBindGroup);
    pass.dispatchWorkgroups(Math.ceil(jobCount / 64));
    pass.end();
  }
  for (let i = 0; i < dequeuePasses; i += 1) {
    const pass = encoder.beginComputePass();
    pass.setPipeline(dequeuePipeline);
    pass.setBindGroup(0, dequeueBindGroup);
    pass.dispatchWorkgroups(Math.ceil(jobCount / 64));
    pass.end();
  }

  const readbackOutput = device.createBuffer({
    size: jobCount * 4,
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
  const readbackQueue = device.createBuffer({
    size: queueHeaderSize,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  });

  encoder.copyBufferToBuffer(outputBuffer, 0, readbackOutput, 0, jobCount * 4);
  encoder.copyBufferToBuffer(enqueueStatusBuffer, 0, readbackEnqueueStatus, 0, jobCount * 4);
  encoder.copyBufferToBuffer(dequeueStatusBuffer, 0, readbackDequeueStatus, 0, jobCount * 4);
  encoder.copyBufferToBuffer(queueBuffer, 0, readbackQueue, 0, queueHeaderSize);

  device.queue.submit([encoder.finish()]);
  await device.queue.onSubmittedWorkDone();
  const oomError = await device.popErrorScope();
  const validationError = await device.popErrorScope();
  if (validationError) {
    logLine(`Validation error: ${validationError.message}`);
  }
  if (oomError) {
    logLine(`OOM error: ${oomError.message}`);
  }

  await readbackOutput.mapAsync(GPUMapMode.READ);
  await readbackEnqueueStatus.mapAsync(GPUMapMode.READ);
  await readbackDequeueStatus.mapAsync(GPUMapMode.READ);
  await readbackQueue.mapAsync(GPUMapMode.READ);

  const output = new Uint32Array(readbackOutput.getMappedRange());
  const enqueueStatus = new Uint32Array(readbackEnqueueStatus.getMappedRange());
  const dequeueStatus = new Uint32Array(readbackDequeueStatus.getMappedRange());
  const queueState = new Uint32Array(readbackQueue.getMappedRange());

  const enqOk = enqueueStatus.reduce((sum, v) => sum + v, 0);
  const deqOk = dequeueStatus.reduce((sum, v) => sum + v, 0);

  logLine(`Enqueued: ${enqOk} / ${jobCount}`);
  logLine(`Dequeued: ${deqOk} / ${jobCount}`);
  logLine(`Queue head/tail: ${queueState[0]} / ${queueState[1]}`);
  if (deqOk === 0) {
    logLine("No data dequeued.");
  }

  const samples = [];
  for (let i = 0; i < output.length; i += 1) {
    if (dequeueStatus[i] === 1) {
      samples.push(u32ToFloatSigned(output[i]));
    }
  }

  const usable = samples.length;
  if (usable < 1024) {
    logLine(`Warning: only ${usable} samples for FFT.`);
  }

  const windowSize = 256;
  const hop = 128;
  const { spec, frames, bins, maxMag } = makeSpectrogram(samples, windowSize, hop);

  const spectrumAvg = new Float32Array(bins);
  for (let f = 0; f < frames; f += 1) {
    for (let b = 0; b < bins; b += 1) {
      spectrumAvg[b] += spec[f * bins + b];
    }
  }
  for (let b = 0; b < bins; b += 1) {
    spectrumAvg[b] /= Math.max(1, frames);
  }

  const analysis = analyzeRandomness(samples, spectrumAvg);
  logLine(`Mean: ${analysis.mean.toFixed(4)}`);
  logLine(`Variance: ${analysis.variance.toFixed(4)} (uniform [-1,1] ~= 0.3333)`);
  logLine(`Lag-1 autocorr: ${analysis.autocorr.toFixed(4)} (near 0 is good)`);
  logLine(`Spectral flatness: ${analysis.flatness.toFixed(4)} (near 1 is good)`);
  logLine(`Spectrum CV: ${analysis.spectrumCv.toFixed(4)} (lower is flatter)`);

  drawSpectrogram(spec, frames, bins, maxMag);

  readbackOutput.unmap();
  readbackEnqueueStatus.unmap();
  readbackDequeueStatus.unmap();
  readbackQueue.unmap();
}

init().catch((err) => {
  logLine(`Error: ${err.message}`);
  console.error(err);
});
