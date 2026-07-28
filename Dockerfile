FROM node:20-alpine

WORKDIR /app

# Copy package files first
COPY package*.json ./

# Install production dependencies only
RUN npm install --omit=dev

# Copy the rest of the source
COPY . .

CMD ["node", "index.js"]
