FROM node:20-alpine

# Install FFmpeg
RUN apk add --no-cache ffmpeg

# Set work directory
WORKDIR /app

# Copy dependency configs
COPY package.json package-lock.json* ./

# Install dependencies (including devDependencies to compile TypeScript)
RUN npm install

# Copy application files
COPY . .

# Compile TypeScript
RUN npx tsc

# Expose server port
EXPOSE 3001

# Start the node server
CMD ["node", "dist/index.js"]
