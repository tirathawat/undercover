FROM node:26-alpine AS frontend
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY index.html tsconfig.json vite.config.ts ./
COPY src ./src
COPY shared ./shared
RUN npm run build

FROM golang:1.26.4-alpine AS backend
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY cmd ./cmd
COPY internal ./internal
RUN CGO_ENABLED=0 go build -trimpath -o /undercover ./cmd/undercover

FROM alpine:3.22
WORKDIR /app
RUN addgroup -S app && adduser -S app -G app
COPY --from=backend /undercover ./undercover
COPY --from=frontend /app/dist ./dist
USER app
ENV PORT=8080 WEB_DIR=/app/dist
EXPOSE 8080
CMD ["./undercover"]
