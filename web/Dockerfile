# Multi-stage build for YourPrinter Modern WebUI
FROM node:22-alpine AS build

WORKDIR /app

# Install dependencies using package-lock.json
COPY package*.json ./
RUN npm ci

# Copy source code and build production bundle
COPY . .
RUN npm run build

# Nginx production runtime stage
FROM nginx:alpine

# Copy static assets to Nginx html root
COPY --from=build /app/dist /usr/share/nginx/html

# Copy Nginx reverse proxy configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
