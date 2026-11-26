'use strict';
// Verified fal.ai model catalog.
// Every endpoint below was validated against fal's published OpenAPI schema
// (see resources/fal-schemas/*.json, fetched from
//  https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=<id>).
// Do not add endpoints here without the same verification: the UI derives its
// controls from this file, so an invented model would produce dead controls.

const IMAGE_SIZES = ['square_hd', 'square', 'portrait_4_3', 'portrait_16_9', 'landscape_4_3', 'landscape_16_9'];

const p = (name, label, type, extra = {}) => ({ name, label, type, ...extra });

const FAL_MODELS = [
  {
    id: 'fal-ai/flux/schnell',
    provider: 'fal',
    label: 'FLUX.1 [schnell]',
    task: 'image.generate',
    output: 'image',
    blurb: 'Fast text-to-image, 1-4 images per call.',
    inputKey: 'prompt',
    resultPath: 'images',
    params: [
      p('prompt', 'Prompt', 'text', { required: true, multiline: true }),
      p('image_size', 'Aspect / size', 'enum', { values: IMAGE_SIZES, default: 'landscape_4_3' }),
      p('num_images', 'Images', 'int', { min: 1, max: 4, default: 1 }),
      p('num_inference_steps', 'Steps', 'int', { min: 1, max: 12, default: 4 }),
      p('guidance_scale', 'Guidance', 'float', { min: 1, max: 20, default: 3.5 }),
      p('output_format', 'Format', 'enum', { values: ['jpeg', 'png'], default: 'jpeg' }),
      p('seed', 'Seed', 'int', { min: 0, max: 4294967295 }),
    ],
  },
  {
    id: 'fal-ai/flux/dev',
    provider: 'fal',
    label: 'FLUX.1 [dev]',
    task: 'image.generate',
    output: 'image',
    blurb: 'Higher fidelity text-to-image.',
    resultPath: 'images',
    params: [
      p('prompt', 'Prompt', 'text', { required: true, multiline: true }),
      p('image_size', 'Aspect / size', 'enum', { values: IMAGE_SIZES, default: 'landscape_4_3' }),
      p('num_images', 'Images', 'int', { min: 1, max: 4, default: 1 }),
      p('num_inference_steps', 'Steps', 'int', { min: 1, max: 50, default: 28 }),
      p('guidance_scale', 'Guidance', 'float', { min: 1, max: 20, default: 3.5 }),
      p('output_format', 'Format', 'enum', { values: ['jpeg', 'png'], default: 'jpeg' }),
      p('seed', 'Seed', 'int', { min: 0, max: 4294967295 }),
    ],
  },
  {
    id: 'fal-ai/flux/dev/image-to-image',
    provider: 'fal',
    label: 'FLUX.1 [dev] Image-to-Image',
    task: 'image.edit',
    output: 'image',
    blurb: 'Transform an existing image with a prompt.',
    resultPath: 'images',
    requiresImage: true,
    imageParam: 'image_url',
    params: [
      p('prompt', 'Prompt', 'text', { required: true, multiline: true }),
      p('strength', 'Strength', 'float', { min: 0.01, max: 1, default: 0.95 }),
      p('num_inference_steps', 'Steps', 'int', { min: 10, max: 50, default: 40 }),
      p('guidance_scale', 'Guidance', 'float', { min: 1, max: 20, default: 3.5 }),
      p('num_images', 'Images', 'int', { min: 1, max: 4, default: 1 }),
      p('output_format', 'Format', 'enum', { values: ['jpeg', 'png'], default: 'jpeg' }),
      p('seed', 'Seed', 'int', { min: 0, max: 4294967295 }),
    ],
  },
  {
    id: 'fal-ai/wan/v2.2-a14b/text-to-video',
    provider: 'fal',
    label: 'Wan 2.2 A14B Text-to-Video',
    task: 'video.generate',
    output: 'video',
    blurb: 'Text-to-video up to 161 frames.',
    resultPath: 'video',
    params: [
      p('prompt', 'Prompt', 'text', { required: true, multiline: true }),
      p('aspect_ratio', 'Aspect ratio', 'enum', { values: ['16:9', '9:16', '1:1'], default: '16:9' }),
      p('resolution', 'Resolution', 'enum', { values: ['480p', '580p', '720p'], default: '720p' }),
      p('num_frames', 'Frames', 'int', { min: 17, max: 161, default: 81, help: '81 frames @16fps ≈ 5s' }),
      p('frames_per_second', 'FPS', 'int', { min: 5, max: 30, default: 16 }),
      p('negative_prompt', 'Negative prompt', 'text', { default: '' }),
      p('num_inference_steps', 'Steps', 'int', { min: 2, max: 40, default: 27 }),
      p('seed', 'Seed', 'int', { min: 0, max: 4294967295 }),
    ],
  },
  {
    id: 'fal-ai/wan/v2.2-a14b/image-to-video',
    provider: 'fal',
    label: 'Wan 2.2 A14B Image-to-Video',
    task: 'video.generate',
    output: 'video',
    blurb: 'Animate a still image, optional end frame.',
    resultPath: 'video',
    requiresImage: true,
    imageParam: 'image_url',
    endImageParam: 'end_image_url',
    params: [
      p('prompt', 'Prompt', 'text', { required: true, multiline: true }),
      p('aspect_ratio', 'Aspect ratio', 'enum', { values: ['auto', '16:9', '9:16', '1:1'], default: 'auto' }),
      p('resolution', 'Resolution', 'enum', { values: ['480p', '580p', '720p'], default: '720p' }),
      p('num_frames', 'Frames', 'int', { min: 17, max: 161, default: 81 }),
      p('frames_per_second', 'FPS', 'int', { min: 5, max: 30, default: 16 }),
      p('negative_prompt', 'Negative prompt', 'text', { default: '' }),
      p('num_inference_steps', 'Steps', 'int', { min: 2, max: 40, default: 27 }),
      p('seed', 'Seed', 'int', { min: 0, max: 4294967295 }),
    ],
  },
  {
    id: 'fal-ai/imageutils/rembg',
    provider: 'fal',
    label: 'Background Removal (rembg)',
    task: 'image.removeBackground',
    output: 'image',
    blurb: 'Cut the subject out of an image.',
    resultPath: 'image',
    requiresImage: true,
    imageParam: 'image_url',
    params: [p('crop_to_bbox', 'Crop to subject', 'bool', { default: false })],
  },
  {
    id: 'fal-ai/elevenlabs/tts/eleven-v3',
    provider: 'fal',
    label: 'ElevenLabs TTS v3',
    task: 'audio.speak',
    output: 'audio',
    blurb: 'Text-to-speech narration.',
    resultPath: 'audio',
    params: [
      p('text', 'Text', 'text', { required: true, multiline: true }),
      p('voice', 'Voice', 'enum', { values: ['Rachel', 'Aria', 'Roger', 'Sarah', 'Laura', 'Charlie', 'George', 'Callum'], default: 'Rachel' }),
      p('stability', 'Stability', 'float', { min: 0, max: 1, default: 0.5 }),
      p('output_format', 'Format', 'enum', { values: ['mp3_44100_128', 'mp3_44100_192', 'mp3_22050_32'], default: 'mp3_44100_128' }),
    ],
  },
];

// Local, always-available operations implemented with ffmpeg. No credentials, no network.
const LOCAL_MODELS = [
  {
    id: 'local/upscale-2x',
    provider: 'local',
    label: 'Upscale 2x (Lanczos)',
    task: 'image.upscale',
    output: 'image',
    blurb: 'Local ffmpeg lanczos upscale of an image.',
    params: [p('scale', 'Scale factor', 'enum', { values: ['2', '3', '4'], default: '2' })],
  },
  {
    id: 'local/enhance',
    provider: 'local',
    label: 'Enhance (contrast/sharpen)',
    task: 'image.enhance',
    output: 'image',
    blurb: 'Local ffmpeg unsharp + contrast pass.',
    params: [p('amount', 'Strength', 'float', { min: 0.2, max: 3, default: 1 })],
  },
  {
    id: 'local/denoise',
    provider: 'local',
    label: 'Denoise (hqdn3d)',
    task: 'image.enhance',
    output: 'image',
    blurb: 'Local temporal/spatial denoise.',
    params: [p('strength', 'Strength', 'enum', { values: ['light', 'medium', 'strong'], default: 'medium' })],
  },
  {
    id: 'local/filter',
    provider: 'local',
    label: 'Colour & filter lab',
    task: 'image.filter',
    output: 'image',
    blurb: 'Local ffmpeg colour correction and finishing: exposure, contrast, saturation, hue, blur, sharpen, vignette, grain.',
    params: [
      p('brightness', 'Brightness', 'float', { min: -0.5, max: 0.5, default: 0 }),
      p('contrast', 'Contrast', 'float', { min: 0.5, max: 2, default: 1 }),
      p('saturation', 'Saturation', 'float', { min: 0, max: 2, default: 1 }),
      p('hue', 'Hue rotate (deg)', 'int', { min: -180, max: 180, default: 0 }),
      p('blur', 'Blur sigma', 'float', { min: 0, max: 20, default: 0 }),
      p('sharpen', 'Sharpen', 'float', { min: 0, max: 3, default: 0 }),
      p('vignette', 'Vignette', 'bool', { default: false }),
      p('grain', 'Grain', 'int', { min: 0, max: 40, default: 0 }),
    ],
  },
  {
    id: 'local/video-enhance',
    provider: 'local',
    label: 'Video Enhance + Upscale',
    task: 'video.enhance',
    output: 'video',
    blurb: 'Local ffmpeg scale + unsharp pass on a video.',
    params: [p('height', 'Target height', 'enum', { values: ['720', '1080', '1440'], default: '1080' })],
  },
];

// Deterministic offline models. Every result produced here is labelled Mock — unverified.
const MOCK_MODELS = [
  { id: 'mock/image', provider: 'mock', label: 'Mock Image', task: 'image.generate', output: 'image', blurb: 'Offline deterministic image fixture.', params: [] },
  { id: 'mock/image-edit', provider: 'mock', label: 'Mock Image Edit', task: 'image.edit', output: 'image', blurb: 'Offline deterministic edit fixture.', params: [], requiresImage: true, imageParam: 'image_url' },
  { id: 'mock/video', provider: 'mock', label: 'Mock Video', task: 'video.generate', output: 'video', blurb: 'Offline deterministic video fixture.', params: [] },
  { id: 'mock/audio', provider: 'mock', label: 'Mock Audio', task: 'audio.speak', output: 'audio', blurb: 'Offline deterministic audio fixture.', params: [] },
  { id: 'mock/removebg', provider: 'mock', label: 'Mock Background Removal', task: 'image.removeBackground', output: 'image', blurb: 'Offline fixture.', params: [], requiresImage: true, imageParam: 'image_url' },
];

const ALL_MODELS = [...FAL_MODELS, ...LOCAL_MODELS, ...MOCK_MODELS];

const TASKS = {
  'image.generate': { media: 'image', label: 'Image generation' },
  'image.edit': { media: 'image', label: 'Image edit' },
  'image.removeBackground': { media: 'image', label: 'Background removal' },
  'image.upscale': { media: 'image', label: 'Upscale' },
  'image.enhance': { media: 'image', label: 'Enhance' },
  'image.filter': { media: 'image', label: 'Colour & filters' },
  'video.generate': { media: 'video', label: 'Video generation' },
  'video.enhance': { media: 'video', label: 'Video enhance' },
  'audio.speak': { media: 'audio', label: 'Speech' },
  'text.enhance': { media: 'text', label: 'Prompt enhancement' },
};

function getModel(id) {
  return ALL_MODELS.find((m) => m.id === id) || null;
}

function modelsForTask(task) {
  return ALL_MODELS.filter((m) => m.task === task);
}

/** Validate + coerce user params against the model's declared schema. */
function validateParams(model, raw = {}) {
  const out = {};
  const errors = [];
  for (const def of model.params || []) {
    let v = raw[def.name];
    if (v === undefined || v === '' || v === null) {
      if (def.default !== undefined) v = def.default;
      else if (def.required) {
        errors.push(`${def.label || def.name} is required`);
        continue;
      } else continue;
    }
    switch (def.type) {
      case 'int': {
        const n = Number(v);
        if (!Number.isFinite(n)) {
          errors.push(`${def.label || def.name} must be a number`);
          break;
        }
        if (def.min !== undefined && n < def.min) {
          errors.push(`${def.label} must be >= ${def.min}`);
          break;
        }
        if (def.max !== undefined && n > def.max) {
          errors.push(`${def.label} must be <= ${def.max}`);
          break;
        }
        out[def.name] = Math.round(n);
        break;
      }
      case 'float': {
        const n = Number(v);
        if (!Number.isFinite(n)) {
          errors.push(`${def.label || def.name} must be a number`);
          break;
        }
        if (def.min !== undefined && n < def.min) errors.push(`${def.label} must be >= ${def.min}`);
        if (def.max !== undefined && n > def.max) errors.push(`${def.label} must be <= ${def.max}`);
        out[def.name] = n;
        break;
      }
      case 'bool':
        out[def.name] = v === true || v === 'true' || v === 1 || v === '1';
        break;
      case 'enum':
        if (!def.values.includes(String(v))) errors.push(`${def.label || def.name} must be one of ${def.values.join(', ')}`);
        out[def.name] = String(v);
        break;
      default:
        out[def.name] = String(v);
    }
  }
  if (errors.length) {
    const err = new Error(errors.join('; '));
    err.validation = errors;
    throw err;
  }
  return out;
}

module.exports = { ALL_MODELS, FAL_MODELS, LOCAL_MODELS, MOCK_MODELS, TASKS, getModel, modelsForTask, validateParams };
