FROM node:26.7.0-bookworm-slim
WORKDIR /addon
RUN npm install --global npm@11.19.0
COPY package.json package-lock.json .npmrc ./
COPY vendor ./vendor
RUN npm ci
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
COPY admin ./admin
COPY public ./public
COPY migrations ./migrations
COPY README.md ./README.md
RUN npm run typecheck && npm run build && npm pack
