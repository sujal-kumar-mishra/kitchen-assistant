# Use latest LTS
FROM node:20-alpine

WORKDIR /app

# Install dependencies
COPY package.json package-lock.json* ./
RUN npm ci --production

# Copy app
COPY . .

# Expose port
EXPOSE 5000

ENV NODE_ENV=production

CMD ["node", "server.js"]
