# No runtime dependencies: Node runs the TypeScript directly, same as `npm run dev`.
FROM node:22-alpine
WORKDIR /app
COPY package.json ./
COPY src ./src
COPY public ./public
USER node
EXPOSE 4000
CMD ["node", "--experimental-strip-types", "src/index.ts"]
