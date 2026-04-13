FROM node:20-slim

WORKDIR /app
RUN apt update && apt install -y libfontconfig1 bzip2
COPY package*.json /app
RUN npm install

COPY . /app

EXPOSE 8888
ENTRYPOINT npm run setup && npm run start
