FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# NEXT_PUBLIC_* are inlined into the client bundle at build time, so they must be
# present here (not just at runtime). Passed via docker-compose build.args.
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_ADMIN_API_KEY
ARG NEXT_PUBLIC_SDK_KEY
ARG NEXT_PUBLIC_NODE_URLS
ARG NEXT_PUBLIC_PROMETHEUS_URL
ARG NEXT_PUBLIC_GRAFANA_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_ADMIN_API_KEY=$NEXT_PUBLIC_ADMIN_API_KEY \
    NEXT_PUBLIC_SDK_KEY=$NEXT_PUBLIC_SDK_KEY \
    NEXT_PUBLIC_NODE_URLS=$NEXT_PUBLIC_NODE_URLS \
    NEXT_PUBLIC_PROMETHEUS_URL=$NEXT_PUBLIC_PROMETHEUS_URL \
    NEXT_PUBLIC_GRAFANA_URL=$NEXT_PUBLIC_GRAFANA_URL
RUN npm run build

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
COPY --from=builder /app/public ./public
EXPOSE 3000
CMD ["npm", "start"]
