FROM node:18.20-alpine3.20

ARG NODE_ENV=production
ENV NODE_ENV=$NODE_ENV

USER node

RUN mkdir -p /home/node/opt/node_app
WORKDIR /home/node/opt/node_app

COPY --chown=node:node package.json package-lock.json* ./

RUN npm ci
RUN npm cache clean --force
ENV PATH=/home/node/opt/node_app/node_modules/.bin:$PATH

RUN mkdir -p /home/node/opt/node_app
COPY --chown=node:node . .

RUN npm run build
CMD [ "npm", "run", "prod" ]
