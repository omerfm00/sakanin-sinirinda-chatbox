FROM node:22-alpine AS base
WORKDIR /workspace
COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/student-web/package.json ./apps/student-web/package.json
COPY apps/teacher-web/package.json ./apps/teacher-web/package.json
COPY apps/admin-web/package.json ./apps/admin-web/package.json
RUN npm ci
COPY apps/api ./apps/api

FROM base AS development
COPY . .
EXPOSE 3000
CMD ["npm", "run", "start:dev", "--workspace", "apps/api"]

FROM base AS production-build
RUN npm run build --workspace apps/api

FROM node:22-alpine AS production
ENV NODE_ENV=production
WORKDIR /workspace
COPY --from=base /workspace/node_modules ./node_modules
COPY --from=base /workspace/apps/api/package.json ./apps/api/package.json
COPY --from=production-build /workspace/apps/api/dist ./apps/api/dist
EXPOSE 3000
CMD ["node", "apps/api/dist/main.js"]
