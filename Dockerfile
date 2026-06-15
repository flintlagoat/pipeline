# Inkwell render worker — runs the full pipeline (canvas + ffmpeg) and uploads the MP4 to Supabase.
# Lean image: transcription uses the cloud backend (TRANSCRIBE_BACKEND=cloud), so NO Python/torch.
FROM node:20-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg ca-certificates fonts-liberation \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install deps first for layer caching. ts-node is needed at runtime (worker + the renderer it spawns).
COPY pipeline/package.json ./pipeline/
COPY renderer/package.json ./renderer/
RUN cd pipeline && npm install --no-audit --no-fund
RUN cd renderer && npm install --no-audit --no-fund

# App source (pipeline, renderer, channels, assets). .dockerignore keeps it lean + excludes secrets.
COPY . .

ENV NODE_ENV=production
ENV TRANSCRIBE_BACKEND=cloud
EXPOSE 8080

CMD ["sh","-c","cd pipeline && npx ts-node --transpile-only src/renderService.ts"]
