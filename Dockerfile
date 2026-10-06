# syntax = docker/dockerfile:1

# Chain Reaction: one Node process serving the game, Socket.IO, the level API
# and /readme/. Fixed by the course: HTTP on 0.0.0.0:$PORT, and anything that
# persists lives on the /data volume.

# The browser game (Phaser, TypeScript) is built by Vite here; only the built
# files reach the image.
FROM docker.io/library/node:24.21.0-slim AS client
WORKDIR /app
RUN npm install -g pnpm@11.9.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY vite.config.ts ./
COPY src/ src/
RUN pnpm build

# The server runs its TypeScript directly (type stripping): no server build.
FROM docker.io/library/node:24.21.0-slim
WORKDIR /app
RUN npm install -g pnpm@11.9.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --prod --frozen-lockfile --ignore-scripts
COPY src/server/ src/server/
COPY src/shared/ src/shared/
COPY --from=client /app/dist/client/ dist/client/
COPY README.md ./
# docs/ holds any images README.md links to
COPY docs/ docs/
ENV NODE_ENV=production DATA_DIR=/data
# the machine has 256 MB; leave room for the rest of the process
CMD ["node", "--max-old-space-size=160", "src/server/main.ts"]
