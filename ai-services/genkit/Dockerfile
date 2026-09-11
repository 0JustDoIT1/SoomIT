FROM node:22-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=optional
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:22-slim
ENV NODE_ENV=production
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev --omit=optional
COPY --from=build /app/dist ./dist
USER node
CMD ["node", "dist/server.js"]
