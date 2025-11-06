FROM node:20-alpine

# Install dependencies for better-sqlite3 compilation
RUN apk add --no-cache \
    sqlite \
    python3 \
    make \
    g++ \
    libc6-compat

# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Set environment variables
ENV PYTHON=/usr/bin/python3

# Install dependencies
RUN npm install

# Copy TypeScript config
COPY tsconfig.json ./

# Copy source code
COPY src/ ./src/

# Create directories for frontend build files and database
RUN mkdir -p /app/frontend/dist && chmod 777 /app/frontend/dist
RUN mkdir -p /app/database && chmod 777 /app/database

# Expose port
EXPOSE 3000

# Use development command with pretty logging
CMD ["npm", "run", "dev"]