# Stage 1: Build the React Frontend
FROM node:24-alpine AS ui-builder
WORKDIR /web
# Install dependencies first for better caching
COPY web/package*.json ./
RUN npm ci
# Build the UI
COPY web/ .
RUN npm run build

# Stage 2: Build the Go Backend
FROM golang:1.25-alpine AS go-builder
RUN apk add --no-cache make git
WORKDIR /workspace
COPY go.mod go.sum ./
RUN go mod download
COPY . .
# Copy the built UI assets to be embedded
COPY --from=ui-builder /web/dist/ internal/ui/dist/
ARG BUILD_VERSION=v0.0.0
# Build static binary
RUN CGO_ENABLED=0 GOOS=linux go build \
    -ldflags="-w -s -X github.com/ygelfand/power-dash/internal/cli.PowerDashVersion=${BUILD_VERSION}" \
    -o bin/power-dash cmd/power-dash/main.go

# Stage 3: Final Production Image
FROM alpine:3.23

# Create a non-root user and group
RUN addgroup -S powerdash && adduser -S powerdash -G powerdash

# Install necessary runtime dependencies
RUN apk add --no-cache ca-certificates tzdata

# Create directory structure
WORKDIR /app
RUN mkdir -p /data /etc/power-dash

# Copy binary
COPY --from=go-builder /workspace/bin/power-dash /usr/local/bin/power-dash

COPY config/power-dash.example.yaml /etc/power-dash/power-dash.yaml

RUN chown -R powerdash:powerdash /data

# Expose the application port
EXPOSE 8080

# Define volume for persistent data
VOLUME ["/data"]

# Switch to non-root user
USER powerdash

# Default entrypoint
ENTRYPOINT ["power-dash"]
CMD ["run"]
