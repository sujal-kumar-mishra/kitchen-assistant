# Use Node.js official image
FROM node:18-alpine

WORKDIR /app

# Install curl for healthcheck and add tini for proper signal handling
RUN apk add --no-cache curl tini

# Copy package files
COPY package*.json ./

# Set NODE_ENV for smaller installs
ENV NODE_ENV=production

# Install dependencies (production only)
RUN npm ci --only=production

# Copy application files
COPY . .

# Create non-root user for security
RUN addgroup -S nodegroup && adduser -S nodeuser -G nodegroup
USER nodeuser

EXPOSE 8081

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD curl -fsS http://localhost:8081/health || exit 1

# Start the application via tini for correct signal handling
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["npm", "start"]
