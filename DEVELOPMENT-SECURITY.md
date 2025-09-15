# Development Guide - Security Branch

## Starting the Development Environment

### Prerequisites
- Docker installed
- 42school image built
- Being on the `feature/security-mafurnic` branch

### Starting the Development Containers

1. **First Terminal (Backend)**
```bash
# Start container with port forwarding
docker run -it --rm -v "$PWD":/app -w /app -p 3000:3000 -p 5173:5173 42school:latest

# Inside the container, start backend
cd src/backend
npm run dev
```

2. **Get Container ID**

```bash
# In a new terminal on your Mac
docker ps
# Note down the container ID (e.g., ae6afdcfce11)
```

3. **Second Terminal (Frontend)**
```bash
# Connect to the same container
docker exec -it <container-id> /bin/bash

# Inside the container, start frontend
cd src/frontend
npm run dev
```

### Testing
Once both services are running, you can access:
- Frontend: http://localhost:5173
- Backend API: http://localhost:3000/api
- Health Check: http://localhost:3000/health

### Port Usage
- 3000: Backend server + WebSocket
- 5173: Frontend development server

### Notes
- Both terminals are running in the same container
- Port forwarding is set up in the first terminal
- Changes in your local files are reflected in the container due to volume mounting
- Environment variables are loaded from `.env` file
