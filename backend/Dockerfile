FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY . .
RUN mkdir -p /app/data

ENV PORT=3001

EXPOSE 3001

CMD ["npm", "start"]
