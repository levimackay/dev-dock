# Two-stage build: node to compile, nginx to serve the static output. The
# runtime image contains no node, no npm, and no source.
#
# `dist/` is about 1.4 MB uncompressed, most of it self-hosted font subsets that
# a given visitor never downloads: the browser fetches only the unicode ranges
# it needs, so a Latin-script reader pulls two of the sixteen.

FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm run build

FROM nginx:1.27-alpine AS runtime
COPY --from=build /app/dist /usr/share/nginx/html
COPY deploy/nginx.docker.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://localhost/ >/dev/null || exit 1
