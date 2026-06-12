FROM node:26-alpine AS build
WORKDIR /app
COPY services/admin-interface/package.json services/admin-interface/package-lock.json ./
RUN npm ci
COPY services/admin-interface/ .
RUN npm run build

FROM nginx:alpine AS runtime
COPY --from=build /app/dist /usr/share/nginx/html
COPY services/admin-interface/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
