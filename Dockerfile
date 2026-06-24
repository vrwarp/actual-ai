FROM node:22.21-alpine3.22

ARG NODE_ENV=production
ENV NODE_ENV=$NODE_ENV

# Install build dependencies for native modules
RUN apk add --no-cache python3 make g++

USER node

WORKDIR /opt/node_app

COPY --chown=node:node package.json package-lock.json* patch-api.js* ./
RUN npm ci && npm cache clean --force && node patch-api.js
ENV PATH=/opt/node_app/node_modules/.bin:$PATH

WORKDIR /opt/node_app/app
COPY --chown=node:node . .
RUN npm run build
# tsc compiles .ts only — copy the static Web UI assets into dist and verify.
RUN cp -r /opt/node_app/app/src/web-ui /opt/node_app/app/dist/src/web-ui \
    && test -f /opt/node_app/app/dist/src/web-ui/index.html

# Companion config-editor / debug Web UI (opt-in via WEB_UI_ENABLED=true).
EXPOSE 3001

CMD [ "npm", "run", "prod" ]
