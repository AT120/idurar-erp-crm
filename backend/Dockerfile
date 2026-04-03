FROM node:20-slim

WORKDIR /app
RUN apt update && apt install -y libfontconfig1 bzip2
COPY package*.json /app
RUN npm install

COPY . /app

ENTRYPOINT npm run setup && npm run dev
