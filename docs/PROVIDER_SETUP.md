# Provider setup

OASIS works with **fal.ai alone**. DeepSeek and Ollama are optional, disabled by default, and never required for startup, storage, editing or export. A missing optional provider can never break the fal.ai path.

Open **Providers** in the sidebar (OASIS Core) — that is the only place credentials are entered. Never paste keys into chat, tickets or source files.

---

## 1. fal.ai (primary)

**What it powers:** image generation, prompt-guided image editing, background removal, text-to-video, image-to-video, text-to-speech.

### Steps

1. Create a key at <https://fal.ai/dashboard/keys> (the "Get a key" button in the provider card opens this).
2. In OASIS → Providers → **fal.ai** card:
   - paste the key into the password field,
   - press **Save**,
   - press **Test connection**.
3. Status should become `connected`. The card shows a masked hint (`••••ABCD`) — the key itself is never displayed again.
4. Generate something in PhotoCraft: output should now be `verified` / `live` rather than mock.

### What "Test connection" actually does

It sends `POST https://queue.fal.run/fal-ai/imageutils/rembg` with an empty JSON body using your key. fal validates the request *before* running any model, so:

| Response | Meaning | Status shown |
|---|---|---|
| `422` / `400` (missing `image_url`) | key accepted, request rejected by schema — **no generation ran, no charge** | `connected` |
| `401` / `403` | key invalid or revoked | `authentication-failed` |
| `429` | key accepted but rate limited | `connected` |
| network failure | host unreachable | `unreachable` |

This is deliberately not a real generation: testing credentials must not spend money.

### Verified model catalog

These endpoints are the only fal models OASIS exposes. Each was validated against fal's published OpenAPI (`https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=<id>`) and the raw schemas are kept in `resources/fal-schemas/`. Every control in the UI comes from that schema — no invented parameters.

| Model ID | Task | Key parameters (as verified) | Result |
|---|---|---|---|
| `fal-ai/flux/schnell` | image.generate | `prompt`, `image_size` (square_hd, square, portrait_4_3, portrait_16_9, landscape_4_3, landscape_16_9), `num_images` 1–4, `num_inference_steps` 1–12, `guidance_scale` 1–20, `output_format` jpeg/png, `seed` | `images[].url` |
| `fal-ai/flux/dev` | image.generate | same shape; steps 1–50 (default 28) | `images[].url` |
| `fal-ai/flux/dev/image-to-image` | image.edit | `image_url` (required), `prompt`, `strength` 0.01–1, steps 10–50, `num_images`, seed | `images[].url` |
| `fal-ai/wan/v2.2-a14b/text-to-video` | video.generate | `prompt`, `aspect_ratio` 16:9/9:16/1:1, `resolution` 480p/580p/720p, `num_frames` 17–161, `frames_per_second`, `negative_prompt`, steps 2–40, seed | `video.url` |
| `fal-ai/wan/v2.2-a14b/image-to-video` | video.generate | same + `image_url` (required) + `end_image_url` (optional), `aspect_ratio` auto/16:9/9:16/1:1 | `video.url` |
| `fal-ai/imageutils/rembg` | image.removeBackground | `image_url` (required), `crop_to_bbox` | `image.url` |
| `fal-ai/elevenlabs/tts/eleven-v3` | audio.speak | `text`, `voice`, `stability` 0–1, `output_format` | `audio.url` |

**Not included:** any endpoint not verified against its schema (for example newer video or upscale models). Adding one requires the same verification step and a catalog entry; the UI derives itself from the catalog, so an unverified entry would create dead controls.

### How local images are sent

fal accepts base64 data URIs for file inputs. OASIS reads the source asset and sends `data:<mime>;base64,…` — no public URL or upload round-trip is required. Files larger than 12 MB are rejected with a clear message rather than silently truncated.

### Costs and rate limits

OASIS does not display prices (they change and vary per account). Generation spends real money on your fal account; the connection test does not. `HttpError` retries only on `429` and `5xx`, with bounded backoff (max 2 retries for submit, 6 consecutive status errors during polling), so a loop cannot hammer the API.

---

## 2. DeepSeek (optional)

**What it powers:** prompt enhancement, prompt expansion, storyboard text, workflow planning text. It is **not** routed any image or video work.

1. Create a key at <https://platform.deepseek.com/api_keys>.
2. Providers → **DeepSeek** → enable the toggle, paste the key, choose a model (`deepseek-flash` default, `deepseek-v4-pro`), Save, then Test connection.
3. The test calls `GET {baseUrl}/models` with `Bearer <key>`; success lists the models the account can use.

Base URL defaults to `https://api.deepseek.com`; the chat call is OpenAI-compatible (`POST /chat/completions`). If the provider is disabled or has no key, prompt-assist buttons in PhotoCraft/FilmCraft are disabled with an explanation instead of failing on click.

---

## 3. Ollama (optional, local)

**What it powers:** the same prompt-assist features, running entirely on your machine.

1. Install Ollama (<https://ollama.com/download>) and pull a model, e.g. `ollama pull llama3.2`.
2. Providers → **Ollama** → enable, confirm the endpoint (default `http://127.0.0.1:11434`), press **Test connection**; installed models are listed and selectable.
3. Save.

The test is `GET /api/tags` with an 8 s timeout. If Ollama is stopped, the card shows `unreachable — Ollama is not running at http://127.0.0.1:11434` and nothing else in the app is affected. OASIS never auto-starts or auto-connects to Ollama.

---

## 4. Execution modes (what you should expect to see)

| Mode | When | Verification label |
|---|---|---|
| `live` | fal enabled + key present | `verified` |
| `local` | ffmpeg operations (upscale, enhance, denoise, export) | `verified` |
| `mock` | explicit mock model, "Force mock" checked, or fal disabled / key missing | `Mock — unverified` |
| `import` | files dragged into Asset Studio | `unverified` (not a generation) |

A `failed` job (bad key, provider error, timeout, missing ffmpeg) stays failed and shows the provider's message. OASIS never converts a real failure into mock output. To unblock, fix the cause and press **Retry** on the job.

---

## 5. Secret handling

- Keys are encrypted with Electron `safeStorage` (DPAPI on Windows) and written to `%APPDATA%/oasis/vault.json` by the **main process**.
- The renderer can write or clear a key, never read it. Only `••••` + last four characters is returned.
- Environment variables `FAL_API_KEY` / `DEEPSEEK_API_KEY` are honoured as a development fallback and labelled "environment" in the UI; this is for development only.
- Keys are redacted from log messages, job errors and IPC failures.
- If OS encryption is unavailable (rare: some locked-down machines), the card warns that the key is only obfuscated on disk.

---

## 6. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Job ends `mock`, reason "fal.ai API key is not configured" | fal enabled but no key saved | Providers → fal → paste key → Save |
| Status `authentication-failed` | key wrong/revoked/whitespace | re-paste the key, Save, Test again |
| Status `unreachable` | no internet, proxy, firewall | check connectivity; the app works offline in mock mode |
| `413`/`422` on edit or image-to-video | source image rejected (size/format) | use PNG/JPEG under 12 MB |
| Video job runs long | provider queue times | leave the workspace; the job continues and shows in Jobs |
| "ffmpeg is not installed" | ffmpeg not on PATH | install ffmpeg, restart OASIS (Settings shows the detected version) |
