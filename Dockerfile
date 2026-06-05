FROM node:22-alpine AS build
WORKDIR /app
COPY package.json ./
RUN npm install
COPY index.html ./
COPY src ./src
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=80
COPY package.json ./
RUN npm install --omit=dev
COPY server.js ./
COPY --from=build /app/dist ./dist
EXPOSE 80
CMD ["node", "server.js"]
