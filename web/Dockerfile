# Blink web: the React site, served by nginx, which also forwards /api and /data/cache to the API.
# Build from the repo root: see docker-compose.yml.
FROM node:24-bookworm-slim AS build
WORKDIR /app/web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
# same-origin API: the browser calls /api on whatever domain serves the site
ENV VITE_API_URL=/api
RUN npm run build

FROM nginx:1.29-alpine
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/web/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s CMD wget -q -O /dev/null http://127.0.0.1/ || exit 1
