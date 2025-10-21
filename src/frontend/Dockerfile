# Multi-stage build for Node.js and nginx
FROM node:18-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./
COPY tailwind.config.js ./
COPY postcss.config.js ./
COPY vite.config.ts ./

# Install dependencies
RUN npm install

# Copy source files
COPY src/ ./src/

# Build the Vite project
RUN npm run build

# Production stage with nginx
FROM debian:bookworm

ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && \
    apt-get install -y nginx openssl && \
    rm -rf /var/lib/apt/lists/*

# Generate self-signed certificate
RUN mkdir -p /etc/nginx/ssl && \
    openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
    -keyout /etc/nginx/ssl/nginx.key -out /etc/nginx/ssl/nginx.crt \
    -subj "/C=AT/ST=Vienna/L=Vienna/O=transcendence/CN=transcended.com"

# Copy built files from builder stage
COPY --from=builder /app/dist/ /var/www/html/

# Copy configuration from directory to Nginx
COPY conf /etc/nginx/sites-available/default

# Expose port for HTTPS
EXPOSE 443

# Start Nginx
CMD ["nginx", "-g", "daemon off;"]