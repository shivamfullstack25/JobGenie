# Build stage
FROM node:22-alpine AS build

WORKDIR /app

COPY package*.json ./

# Install ALL deps (Vite/TypeScript are needed to build)
RUN npm ci

COPY . .

# Bake API URLs into the static build (Vite reads VITE_* at build time)
ARG VITE_API_BASE_URL=http://localhost:8080
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL

RUN npm run build

# Production stage
FROM nginx:alpine

RUN apk add --no-cache curl

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/nginx.conf

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=10s --retries=5 \
  CMD curl -f http://localhost:80 || exit 1

CMD ["nginx", "-g", "daemon off;"]
