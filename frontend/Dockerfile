FROM node:20-alpine

WORKDIR /app

# Install dependencies first (cached layer)
COPY package.json package-lock.json ./
RUN npm ci

# Copy source code
COPY . .

# NEXT_PUBLIC_* vars are baked into the bundle at build time
ENV NEXT_PUBLIC_API_URL=http://localhost:8000

RUN npm run build

EXPOSE 3000

CMD ["npm", "start"]
