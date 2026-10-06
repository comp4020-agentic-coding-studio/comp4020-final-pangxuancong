# syntax = docker/dockerfile:1

# Chain Reaction: one Node process serving the page, the API and /readme/.
# Node runs the TypeScript server directly (type stripping), so there is no
# build step. Fixed by the course: HTTP on 0.0.0.0:$PORT, and anything that
# persists lives on the /data volume.

FROM docker.io/library/node:24.21.0-slim
WORKDIR /app
RUN npm install -g pnpm@11.9.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --prod --frozen-lockfile --ignore-scripts
COPY src/ src/
COPY public/ public/
COPY README.md ./
# docs/ holds any images README.md links to
COPY docs/ docs/
ENV NODE_ENV=production DATA_DIR=/data
# the machine has 256 MB; leave room for the rest of the process
CMD ["node", "--max-old-space-size=160", "src/server/main.ts"]
